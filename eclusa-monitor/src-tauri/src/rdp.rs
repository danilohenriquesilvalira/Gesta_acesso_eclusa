use crate::config::load_config;
use std::process::Command;
use std::sync::Mutex;
use tauri::Emitter;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

// ── Estado dos processos shadow (PIDs) ────────────────────────────────────────

pub struct ShadowState(pub Mutex<Vec<u32>>);

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
    let domain_w      = wide(domain); // IP do servidor destino (workgroup)
    let app_w         = wide("C:\\Windows\\System32\\mstsc.exe");
    let mut cmd_w     = wide(cmdline);
    let mut desktop_w = wide("WinSta0\\Default"); // desktop interactivo do utilizador

    let mut si: STARTUPINFOW = unsafe { std::mem::zeroed() };
    si.cb        = std::mem::size_of::<STARTUPINFOW>() as u32;
    si.lpDesktop = desktop_w.as_mut_ptr();
    // Sem STARTF_USESHOWWINDOW — deixa o mstsc gerir o tamanho da janela
    // via /span ou /multimon, sem forçar maximize no monitor primário.
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
        let handle = pi.hProcess as isize; // mantido aberto para WaitForSingleObject
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

    // Guardar credenciais nos dois formatos que o NLA/mstsc consulta
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

    match Command::new("mstsc").args([&format!("/v:{ip}"), "/multimon", "/f"]).spawn() {
        Ok(mut child) => {
            std::thread::spawn(move || {
                let _ = child.wait();
                let _ = app.emit("rdp-desconectado", cliente);
            });
            String::new()
        }
        Err(e) => format!("Erro ao abrir RDP: {e}"),
    }
}

/// Fecha mstsc de operação silenciosamente.
#[tauri::command]
pub fn fechar_rdp() {
    let _ = Command::new("taskkill")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["/F", "/IM", "mstsc.exe"])
        .output();
}

/// Abre supervisão shadow (view-only) com o sessao_id fornecido pela API.
/// Requer política Shadow=4 no servidor destino.
/// Emite "shadow-fechado" quando a janela é fechada.
#[tauri::command]
pub fn connect_shadow(
    cliente:  String,
    #[allow(non_snake_case)]
    sessaoId: u32,
    state:    tauri::State<ShadowState>,
    app:      tauri::AppHandle,
) -> String {
    let cfg = load_config();

    let ip = if cliente == "cliente1" { &cfg.ip_cliente1 } else { &cfg.ip_cliente2 }.clone();
    if ip.is_empty() {
        return format!("{cliente}: IP não configurado");
    }

    // Bloqueante: mstsc shadow precisa das credenciais antes do NLA.
    // Dois formatos porque o shadow pode consultar qualquer um deles.
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
