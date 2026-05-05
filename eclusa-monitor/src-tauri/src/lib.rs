#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::Emitter;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Config {
    api_url:      String,
    rdp_user:     String,
    rdp_password: String,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            api_url:      "http://172.29.164.10:8080".to_string(),
            rdp_user:     "Administrator".to_string(),
            rdp_password: "Rls@2024".to_string(),
        }
    }
}

fn load_config() -> Config {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    if let Some(dir) = exe_dir {
        if let Ok(content) = std::fs::read_to_string(dir.join("config.json")) {
            if let Ok(cfg) = serde_json::from_str::<Config>(&content) {
                return cfg;
            }
        }
    }
    Config::default()
}

#[tauri::command]
fn get_config() -> Config {
    load_config()
}

/// Abre RDP sem dialog de certificado.
/// Quando o mstsc fechar, emite "rdp-desconectado" para o frontend encerrar a sessão.
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
            "/t", "REG_DWORD",
            "/d", "0",
            "/f",
        ])
        .output();

    match Command::new("mstsc")
        .args([&format!("/v:{ip}"), "/f"])
        .spawn()
    {
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

/// Fecha o mstsc silenciosamente (sem o dialog "sessão encerrada pelo administrador").
/// Chamado quando o operador clica "Sair Operação" — assim o processo é terminado
/// localmente antes do servidor fazer tsdiscon, evitando o popup do Windows.
#[tauri::command]
fn fechar_rdp() {
    let _ = Command::new("taskkill")
        .args(["/F", "/IM", "mstsc.exe"])
        .output();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_config, connect_rdp, fechar_rdp])
        .run(tauri::generate_context!())
        .expect("Erro ao iniciar a aplicação");
}
