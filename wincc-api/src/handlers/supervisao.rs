use axum::{extract::State, Json};
use serde_json::Value;

use crate::{
    auth::AuthUser,
    db::audit::log_evento,
    rdp::broadcast_estado,
    state::Shared,
    types::{now, EncerrarSupervisaoReq, Supervisao, SupervisaoReq},
};

/// POST /supervisao/iniciar — regista supervisor (múltiplos permitidos simultaneamente)
pub async fn iniciar_supervisao(
    State(s):  State<Shared>,
    _auth:     AuthUser,
    Json(req): Json<SupervisaoReq>,
) -> Json<Value> {
    if !["cliente1", "cliente2"].contains(&req.cliente.as_str()) {
        return Json(serde_json::json!({"ok": false, "erro": "Cliente inválido"}));
    }


    // Verificar sessão RDP activa (read lock rápido)
    let (sessao_id, server_ip) = {
        let st = s.inner.read().await;
        let sid = st.rdp.get(&req.cliente)
            .and_then(|r| if r.ocupado { r.sessao_id } else { None });
        let ip  = s.rdp_client_ip(&req.cliente).unwrap_or("").to_string();
        match sid {
            Some(id) => (id, ip),
            None => return Json(serde_json::json!({
                "ok": false,
                "erro": "Sem sessão RDP activa — o operador ainda não está conectado"
            })),
        }
    };

    // Write lock — adiciona supervisor à lista
    let total = {
        let mut st = s.inner.write().await;
        let sups = if req.cliente == "cliente1" {
            &mut st.supervisoes.cliente1
        } else {
            &mut st.supervisoes.cliente2
        };

        // Idempotente: se supervisor já está na lista, devolve OK com a sessão
        if sups.iter().any(|s| s.supervisor.eq_ignore_ascii_case(&req.supervisor)) {
            return Json(serde_json::json!({
                "ok": true,
                "sessao_id": sessao_id,
                "server_ip": server_ip
            }));
        }

        sups.push(Supervisao { supervisor: req.supervisor.clone(), timestamp: now() });
        let total = sups.len();
        broadcast_estado(&st, &s.sse_tx);
        total
    };

    eprintln!("[{}] Supervisão iniciada: {} em {} (sessão {}) total_supervisores={}",
        now(), req.supervisor, req.cliente, sessao_id, total);

    let db  = s.db.clone();
    let msg = format!("Supervisão iniciada: {} em {} sessão {} (total: {})",
        req.supervisor, req.cliente, sessao_id, total);
    tokio::spawn(async move { log_evento(&db, "supervisao_iniciada", &msg).await; });

    Json(serde_json::json!({
        "ok":        true,
        "sessao_id": sessao_id,
        "server_ip": server_ip
    }))
}

/// POST /supervisao/encerrar — remove supervisor específico da lista
pub async fn encerrar_supervisao(
    State(s):  State<Shared>,
    auth:      AuthUser,
    Json(req): Json<EncerrarSupervisaoReq>,
) -> Json<Value> {
    if !["cliente1", "cliente2"].contains(&req.cliente.as_str()) {
        return Json(serde_json::json!({"ok": false, "erro": "Cliente inválido"}));
    }

    {
        let mut st = s.inner.write().await;
        let sups = if req.cliente == "cliente1" {
            &mut st.supervisoes.cliente1
        } else {
            &mut st.supervisoes.cliente2
        };
        sups.retain(|s| !s.supervisor.eq_ignore_ascii_case(&req.supervisor));
        broadcast_estado(&st, &s.sse_tx);
    }

    eprintln!("[{}] Supervisão encerrada: {} em {}", now(), req.supervisor, req.cliente);

    let db  = s.db.clone();
    let msg = format!("Supervisão encerrada: {} em {} (por: {})", req.supervisor, req.cliente, auth.username);
    tokio::spawn(async move { log_evento(&db, "supervisao_encerrada", &msg).await; });

    Json(serde_json::json!({"ok": true}))
}
