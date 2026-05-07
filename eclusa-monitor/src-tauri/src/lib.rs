#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::Mutex;
use tauri::Emitter;

// ── Config ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Config {
    api_url:      String,
    rdp_user:     String,
    rdp_password: String,
    ip_cliente1:  String,
    ip_cliente2:  String,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            api_url:      "http://172.29.164.10:8080".to_string(),
            rdp_user:     "Administrator".to_string(),
            rdp_password: "Rls@2024".to_string(),
            ip_cliente1:  "172.29.164.54".to_string(),
            ip_cliente2:  "172.29.164.58".to_string(),
        }
    }
}

fn load_config() -> Config {
    let candidates = [
        std::env::current_exe().ok()
            .and_then(|p| p.parent().map(|d| d.join("config.json"))),
        std::env::current_dir().ok().map(|d| d.join("config.json")),
        std::env::current_exe().ok()
            .and_then(|p| p.parent()?.parent()?.parent().map(|d| d.join("config.json"))),
    ];
    for path in candidates.into_iter().flatten() {
        if let Ok(txt) = std::fs::read_to_string(&path) {
            if let Ok(cfg) = serde_json::from_str::<Config>(&txt) {
                return cfg;
            }
        }
    }
    Config::default()
}

// ── PIDs dos processos de supervisão (mstsc /shadow) ─────────────────────────

struct ShadowState(Mutex<Vec<u32>>);

// ── Lança mstsc com credenciais de rede explícitas (equiv. runas /netonly) ───

#[cfg(windows)]
fn mstsc_com_credenciais(cmdline: &str, user: &str, password: &str, domain: &str) -> Result<(u32, isize), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError};
    use windows_sys::Win32::System::Threading::{
        CreateProcessWithLogonW, PROCESS_INFORMATION, STARTUPINFOW,
    };

    // Equivalente a: runas /netonly /user:<domain>\<user> mstsc ...
    // As credenciais são usadas APENAS para autenticação de rede (não local)
    const LOGON_NETCREDENTIALS_ONLY: u32 = 2;

    let wide = |s: &str| -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(Some(0u16)).collect()
    };

    let user_w    = wide(user);
    let pass_w    = wide(password);
    let domain_w  = wide(domain);   // IP do servidor destino (ex: "172.29.164.54")
    let app_w     = wide("C:\\Windows\\System32\\mstsc.exe");
    let mut cmd_w = wide(cmdline);
    // Desktop interactivo — garante que a janela aparece no ecrã do utilizador
    let mut desktop_w = wide("WinSta0\\Default");

    let mut si: STARTUPINFOW = unsafe { std::mem::zeroed() };
    si.cb          = std::mem::size_of::<STARTUPINFOW>() as u32;
    si.lpDesktop   = desktop_w.as_mut_ptr();
    si.dwFlags     = 1; // STARTF_USESHOWWINDOW
    si.wShowWindow = 3; // SW_SHOWMAXIMIZED
    let mut pi: PROCESS_INFORMATION = unsafe { std::mem::zeroed() };

    let ok = unsafe {
        CreateProcessWithLogonW(
            user_w.as_ptr(),
            domain_w.as_ptr(),  // domínio = IP do servidor (workgroup)
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

#[tauri::command]
fn get_config() -> Config {
    load_config()
}

/// Abre sessão RDP de operação (ecrã completo).
/// Quando o mstsc fechar, emite "rdp-desconectado" para encerrar a sessão no API.
#[tauri::command]
fn connect_rdp(ip: String, cliente: String, app: tauri::AppHandle) -> String {
    let cfg = load_config();

    let _ = Command::new("cmdkey")
        .args([
            &format!("/generic:{ip}"),
            &format!("/user:{}", cfg.rdp_user),
            &format!("/pass:{}", cfg.rdp_password),
        ])
        .output();

    let _ = Command::new("reg")
        .args([
            "add",
            "HKCU\\Software\\Microsoft\\Terminal Server Client",
            "/v", "AuthenticationLevelOverride",
            "/t", "REG_DWORD", "/d", "0", "/f",
        ])
        .output();

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
fn fechar_rdp() {
    let _ = Command::new("taskkill").args(["/F", "/IM", "mstsc.exe"]).output();
}

/// Abre supervisão shadow (view-only) com o sessao_id fornecido pela API.
/// Requer política Shadow=4 no servidor destino.
/// Emite "shadow-fechado" quando a janela é fechada.
#[tauri::command]
fn connect_shadow(
    cliente:   String,
    #[allow(non_snake_case)]
    sessaoId:  u32,
    state:     tauri::State<ShadowState>,
    app:       tauri::AppHandle,
) -> String {
    let cfg = load_config();

    let ip = if cliente == "cliente1" {
        cfg.ip_cliente1.clone()
    } else {
        cfg.ip_cliente2.clone()
    };

    if ip.is_empty() {
        return format!("{cliente}: IP não configurado");
    }

    // Guarda credenciais nos dois formatos que mstsc consulta para shadow
    for target in [ip.as_str(), &format!("TERMSRV/{ip}")] {
        let _ = Command::new("cmdkey")
            .args([
                &format!("/generic:{target}"),
                &format!("/user:{}", cfg.rdp_user),
                &format!("/pass:{}", cfg.rdp_password),
            ])
            .output();
    }

    // /span → estica a janela pela resolução total de todos os monitores (ex: 1920x2160)
    // É o modo correto para shadow viewer cobrir os 2 monitores físicos
    let cmdline = format!("mstsc /shadow:{sessaoId} /v:{ip} /noConsentPrompt /span");

    match mstsc_com_credenciais(&cmdline, &cfg.rdp_user, &cfg.rdp_password, &ip) {
        Ok((pid, handle)) => {
            state.0.lock().unwrap().push(pid);
            // Thread aguarda o fecho da janela e notifica o frontend
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

/// Fecha o processo de supervisão shadow.
#[tauri::command]
fn fechar_shadow(state: tauri::State<ShadowState>) {
    for pid in state.0.lock().unwrap().drain(..) {
        let _ = Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output();
    }
}

// ── Entry point ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ShadowState(Mutex::new(Vec::new())))
        .invoke_handler(tauri::generate_handler![
            get_config,
            connect_rdp,
            fechar_rdp,
            connect_shadow,
            fechar_shadow,
        ])
        .run(tauri::generate_context!())
        .expect("Erro ao iniciar a aplicação");
}
