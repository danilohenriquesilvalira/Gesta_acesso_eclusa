use axum::{extract::{Path, State}, Json};
use serde_json::Value;
use std::fs;

use crate::{
    config::eclusas_file_path,
    rdp::broadcast_estado,
    state::Shared,
    types::{EclusaEstadoReq, now},
};

/// GET /eclusas — devolve estado actual de todas as eclusas (leitura da memória)
pub async fn get_eclusas(State(s): State<Shared>) -> Json<Value> {
    let st = s.inner.read().await;
    Json(st.eclusas.clone())
}

/// POST /eclusas/:id/estado — WinCC escreve estado da eclusa (sem auth — LAN only)
pub async fn atualizar_eclusa(
    Path(id):  Path<String>,
    State(s):  State<Shared>,
    Json(req): Json<EclusaEstadoReq>,
) -> Json<Value> {
    const VALIDAS: [&str; 5] = ["CL", "CM", "PN", "RG", "VR"];
    let id = id.to_uppercase();

    if !VALIDAS.contains(&id.as_str()) {
        return Json(serde_json::json!({"ok": false, "erro": "Eclusa inválida"}));
    }

    // Atualizar estado em memória e fazer broadcast — zero I/O aqui
    let snapshot = {
        let mut st = s.inner.write().await;
        st.eclusas["eclusas"][&id] = serde_json::json!({
            "status":  req.status,
            "modo":    req.modo,
            "posto":   req.posto,
            "usuario": req.usuario,
        });
        st.eclusas["timestamp"] = serde_json::json!(now());
        broadcast_estado(&st, &s.sse_tx);
        st.eclusas.clone() // snapshot para escrita em disco
    };

    // Persistir em ficheiro em background — nunca bloqueia o handler
    tokio::task::spawn_blocking(move || {
        let path = eclusas_file_path();
        if let Some(dir) = std::path::Path::new(&path).parent() {
            let _ = fs::create_dir_all(dir);
        }
        if let Err(e) = fs::write(&path, serde_json::to_string_pretty(&snapshot).unwrap_or_default()) {
            tracing::warn!(path = %path, erro = %e, "Falha ao persistir eclusas em ficheiro");
        }
    });

    Json(serde_json::json!({"ok": true}))
}

// ── Utilizado apenas no arranque (main.rs) ────────────────────────────────────

/// Lê estado inicial das eclusas do ficheiro JSON.
/// Chamado UMA vez no startup — em runtime o estado vive em AppStateInner.eclusas.
pub fn ler_eclusas_do_disco() -> Value {
    match fs::read_to_string(eclusas_file_path()) {
        Ok(c)  => serde_json::from_str(&c).unwrap_or_else(|_| eclusas_padrao()),
        Err(_) => eclusas_padrao(),
    }
}

pub fn eclusas_padrao() -> Value {
    let livre = serde_json::json!({"status": 0, "modo": "LIVRE", "posto": "", "usuario": ""});
    serde_json::json!({
        "timestamp": "",
        "eclusas": {
            "CL": livre, "CM": livre, "PN": livre, "RG": livre, "VR": livre
        }
    })
}
