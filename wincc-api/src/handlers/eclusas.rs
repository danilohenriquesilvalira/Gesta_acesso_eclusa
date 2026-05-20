use axum::{extract::{Path, State}, Json};
use serde_json::Value;
use std::fs;

use crate::{
    config::eclusas_file_path,
    rdp::broadcast_estado,
    state::Shared,
    types::{EclusaEstadoReq, now},
};

/// GET /eclusas — devolve estado actual de todas as eclusas (leitura do ficheiro JSON)
pub async fn get_eclusas() -> Json<Value> {
    Json(ler_eclusas())
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

    let mut eclusas = ler_eclusas();
    eclusas["eclusas"][&id] = serde_json::json!({
        "status":  req.status,
        "modo":    req.modo,
        "posto":   req.posto,
        "usuario": req.usuario,
    });
    eclusas["timestamp"] = serde_json::json!(now());

    let path = eclusas_file_path();
    if let Some(dir) = std::path::Path::new(&path).parent() {
        let _ = fs::create_dir_all(dir);
    }
    if let Err(e) = fs::write(&path, serde_json::to_string_pretty(&eclusas).unwrap_or_default()) {
        return Json(serde_json::json!({"ok": false, "erro": format!("Ficheiro: {}", e)}));
    }

    let st = s.inner.read().await;
    broadcast_estado(&st, &s.sse_tx);

    Json(serde_json::json!({"ok": true}))
}

// ── Helpers públicos (usados noutros módulos) ─────────────────────────────────

/// Lê estado das eclusas do ficheiro JSON gerido pelo WinCC.
/// Devolve estado padrão (tudo LIVRE) se ficheiro não existir ou estiver corrompido.
pub fn ler_eclusas() -> Value {
    match fs::read_to_string(eclusas_file_path()) {
        Ok(c)  => serde_json::from_str(&c).unwrap_or_else(|_| eclusas_padrao()),
        Err(_) => eclusas_padrao(),
    }
}

fn eclusas_padrao() -> Value {
    let livre = serde_json::json!({"status": 0, "modo": "LIVRE", "posto": "", "usuario": ""});
    serde_json::json!({
        "timestamp": "",
        "eclusas": {
            "CL": livre, "CM": livre, "PN": livre, "RG": livre, "VR": livre
        }
    })
}
