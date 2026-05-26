use crate::config::load_config;
use std::process::Command;
use std::sync::{Mutex, atomic::{AtomicBool, Ordering}};
use tauri::Emitter;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

// ── Estado dos processos shadow (PIDs) ────────────────────────────────────────

pub struct ShadowState(pub Mutex<Vec<u32>>);

// Suprime o evento "rdp-desconectado" durante transições de failover/retorno
// para evitar que handleEncerrar apague a sessão no backend no momento errado.
static SUPRIMIR_DESCONECTADO: AtomicBool = AtomicBool::new(false);

// ── Windows API: lança mstsc com credenciais de rede (runas /netonly) ─────────

#[cfg(windows)]
fn mstsc_com_credenciais(cmdline: &str, user: &str, password: &str, domain: &str) -> Result<(u32, isize), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError};
    use windows_sys::Win32::System::Threading::{
        CreateProcessWithLogonW, PROCESS_INFORMATION, STARTUPINFOW,
    };

    // Credenciais usadas APENAS para autenticação de rede — não alteram o perfil local
    const LOGON_NETCREDENTIALS_ONLY: u32 = 2;

    let wide = |s: &str| -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(Some(0u16)).collect()
    };

    let user_w        = wide(user);
    let pass_w        = wide(password);
    let domain_w      = wide(domain);
    let app_w         = wide("C:\\Windows\\System32\\mstsc.exe");
    let mut cmd_w     = wide(cmdline);
    let mut desktop_w = wide("WinSta0\\Default");

    let mut si: STARTUPINFOW = unsafe { std::mem::zeroed() };
    si.cb        = std::mem::size_of::<STARTUPINFOW>() as u32;
    si.lpDesktop = desktop_w.as_mut_ptr();
    let mut pi: PROCESS_INFORMATION = unsafe { std::mem::zeroed() };

    let ok = unsafe {
        CreateProcessWithLogonW(
            user_w.as_ptr(),
            domain_w.as_ptr(),
            pass_w.as_ptr(),
            LOGON_NETCREDENTIALS_ONLY,
            app_w.as_ptr(),
            cmd_w.as_mut_ptr(),
            0,
            std::ptr::null(),
            std::ptr::null(),
            &si,
            &mut pi,
        )
    };

    if ok != 0 {
        let pid    = pi.dwProcessId;
        let handle = pi.hProcess as isize;
        unsafe { CloseHandle(pi.hThread); }
        Ok((pid, handle))
    } else {
        let err = unsafe { GetLastError() };
        Err(format!("Falha ao lançar mstsc (erro Windows {err})"))
    }
}

// ── Comandos Tauri ────────────────────────────────────────────────────────────

/// Chamado uma vez no arranque — escreve a chave de registo que desativa o
/// prompt de certificado NLA. Não bloqueia o startup (spawn).
pub fn configurar_registo_rdp() {
    let _ = Command::new("reg")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "add",
            "HKCU\\Software\\Microsoft\\Terminal Server Client",
            "/v", "AuthenticationLevelOverride",
            "/t", "REG_DWORD", "/d", "0", "/f",
        ])
        .spawn();
}

/// Abre sessão RDP de operação (ecrã completo, todos os monitores).
/// Emite "rdp-desconectado" quando o mstsc fechar.
#[tauri::command]
pub fn connect_rdp(ip: String, cliente: String, app: tauri::AppHandle) -> String {
    let cfg = load_config();

    for target in [ip.as_str(), &format!("TERMSRV/{ip}")] {
        let _ = Command::new("cmdkey")
            .creation_flags(CREATE_NO_WINDOW)
            .args([
                &format!("/generic:{target}"),
                &format!("/user:{}", cfg.rdp_user),
                &format!("/pass:{}", cfg.rdp_password),
            ])
            .output();
    }

    // /admin: reconecta sempre à sessão console — nunca cria sessão paralela.
    // Garante que só existe uma sessão ativa por servidor em qualquer momento.
    match Command::new("mstsc").args([&format!("/v:{ip}"), "/admin", "/f"]).spawn() {
        Ok(mut child) => {
            std::thread::spawn(move || {
                let _ = child.wait();
                // Só emite se não estiver em transição de failover/retorno
                if !SUPRIMIR_DESCONECTADO.swap(false, Ordering::SeqCst) {
                    let _ = app.emit("rdp-desconectado", cliente);
                }
            });
            String::new()
        }
        Err(e) => format!("Erro ao abrir RDP: {e}"),
    }
}

/// Abre RDP de diagnóstico admin direto a qualquer servidor.
/// Regista autorização temporária na API para que o rdp_poll não expulse a sessão.
#[tauri::command]
pub fn connect_rdp_admin(ip: String, token: String) -> String {
    let cfg = load_config();

    // Notificar backend — autoriza sessão Administrator neste servidor por 10 min
    let _ = std::thread::spawn({
        let ip2    = ip.clone();
        let token2 = token.clone();
        let url    = format!("{}/admin/rdp-direto", cfg.api_url);
        move || {
            let body = format!("{{\"server_ip\":\"{}\",\"client_ip\":\"\"}}", ip2);
            let _ = std::process::Command::new("curl")
                .creation_flags(CREATE_NO_WINDOW)
                .args([
                    "-s", "-X", "POST", &url,
                    "-H", "Content-Type: application/json",
                    "-H", &format!("Authorization: Bearer {}", token2),
                    "-d", &body,
                ])
                .output();
        }
    });

    for target in [ip.as_str(), &format!("TERMSRV/{ip}")] {
        let _ = Command::new("cmdkey")
            .creation_flags(CREATE_NO_WINDOW)
            .args([
                &format!("/generic:{target}"),
                &format!("/user:{}", cfg.rdp_user),
                &format!("/pass:{}", cfg.rdp_password),
            ])
            .output();
    }

    match Command::new("mstsc").args([&format!("/v:{ip}"), "/admin", "/f"]).spawn() {
        Ok(_)  => String::new(),
        Err(e) => format!("Erro ao abrir RDP: {e}"),
    }
}

/// Fecha mstsc de operação normalmente — emite "rdp-desconectado".
#[tauri::command]
pub fn fechar_rdp() {
    let _ = Command::new("taskkill")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["/F", "/IM", "mstsc.exe"])
        .output();
}

/// Fecha mstsc durante transição de failover/retorno — NÃO emite "rdp-desconectado".
/// Evita que handleEncerrar apague a sessão no backend no meio da transição.
#[tauri::command]
pub fn fechar_rdp_transicao() {
    SUPRIMIR_DESCONECTADO.store(true, Ordering::SeqCst);
    let _ = Command::new("taskkill")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["/F", "/IM", "mstsc.exe"])
        .output();
}

/// Abre supervisão shadow (view-only) com o sessao_id fornecido pela API.
/// Usa ficheiro .rdp temporário para forçar resolução 1920x1080 — apagado após fecho.
/// Emite "shadow-fechado" quando a janela é fechada.
#[tauri::command]
pub fn connect_shadow(
    cliente:  String,
    #[allow(non_snake_case)]
    sessaoId: u32,
    #[allow(non_snake_case)]
    serverIp: Option<String>,
    state:    tauri::State<ShadowState>,
    app:      tauri::AppHandle,
) -> String {
    let cfg = load_config();

    // Usa IP fornecido pela API (pode ser reserva em failover); fallback para config
    let ip = serverIp
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            if cliente == "eclusa_RG" { cfg.ip_cliente1.clone() } else { cfg.ip_cliente2.clone() }
        });
    if ip.is_empty() {
        return format!("{cliente}: IP não configurado");
    }

    for target in [ip.as_str(), &format!("TERMSRV/{ip}")] {
        let _ = Command::new("cmdkey")
            .creation_flags(CREATE_NO_WINDOW)
            .args([
                &format!("/generic:{target}"),
                &format!("/user:{}", cfg.rdp_user),
                &format!("/pass:{}", cfg.rdp_password),
            ])
            .output();
    }

    let cmdline = format!("mstsc /shadow:{sessaoId} /v:{ip} /noConsentPrompt /f");

    match mstsc_com_credenciais(&cmdline, &cfg.rdp_user, &cfg.rdp_password, &ip) {
        Ok((pid, handle)) => {
            state.0.lock().unwrap().push(pid);
            std::thread::spawn(move || {
                use windows_sys::Win32::Foundation::CloseHandle;
                use windows_sys::Win32::System::Threading::WaitForSingleObject;
                unsafe {
                    WaitForSingleObject(handle as _, u32::MAX);
                    CloseHandle(handle as _);
                }
                let _ = app.emit("shadow-fechado", cliente);
            });
            String::new()
        }
        Err(e) => e,
    }
}

/// Termina todos os processos shadow registados.
#[tauri::command]
pub fn fechar_shadow(state: tauri::State<ShadowState>) {
    for pid in state.0.lock().unwrap().drain(..) {
        let _ = Command::new("taskkill")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["/F", "/PID", &pid.to_string()])
            .output();
    }
}
