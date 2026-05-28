use axum::{extract::State, http::StatusCode, Json};
use serde_json::Value;

use crate::{
    rdp::broadcast_estado,
    state::Shared,
    types::{now, PlcDados, PlcDadosReq},
};

/// POST /plc/dados — recebe dados de PLCs enviados pelo Node-RED (sem auth, LAN only)
///
/// O Node-RED lê dados dos PLCs via Modbus/S7 e faz POST para este endpoint.
/// Os dados ficam em memória (plc_dados) e são incluídos no SSE /estado.
/// O Node-RED pode chamar este endpoint a qualquer frequência — tipicamente 1-5s.
pub async fn receber_dados_plc(
    State(s):  State<Shared>,
    Json(req): Json<PlcDadosReq>,
) -> (StatusCode, Json<Value>) {
    let plc_id = req.plc.trim().to_lowercase();

    if plc_id.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"ok": false, "erro": "Campo 'plc' obrigatorio"})),
        );
    }

    let entrada = PlcDados {
        plc:           plc_id.clone(),
        ultimo_update: req.timestamp.unwrap_or_else(now),
        dados:         req.dados.clone(),
        online:        true,
    };

    let mut st = s.inner.write().await;
    st.plc_dados.insert(plc_id.clone(), entrada);
    broadcast_estado(&st, &s.sse_tx);

    (StatusCode::OK, Json(serde_json::json!({"ok": true, "plc": plc_id})))
}

/// GET /plc/dados — retorna todos os dados PLC em memória (requer auth, para debug/dashboard)
pub async fn get_dados_plc(State(s): State<Shared>) -> Json<Value> {
    let st = s.inner.read().await;
    let dados: Vec<&PlcDados> = st.plc_dados.values().collect();
    Json(serde_json::json!(dados))
}
