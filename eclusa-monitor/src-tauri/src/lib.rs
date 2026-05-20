#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod rdp;

use rdp::ShadowState;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Escreve chave de registo NLA uma vez no arranque — fora do critical path do connect.
    rdp::configurar_registo_rdp();

    tauri::Builder::default()
        .manage(ShadowState(Mutex::new(Vec::new())))
        .invoke_handler(tauri::generate_handler![
            config::get_config,
            rdp::connect_rdp,
            rdp::fechar_rdp,
            rdp::connect_shadow,
            rdp::fechar_shadow,
        ])
        .run(tauri::generate_context!())
        .expect("Erro ao iniciar a aplicação");
}
