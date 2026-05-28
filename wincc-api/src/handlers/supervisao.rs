use axum::{extract::State, Json};
use serde_json::Value;

use crate::{
    auth::AuthUser,
    db::audit::{self, tipo},
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
    if !["eclusa_RG", "eclusa_PN"].contains(&req.cliente.as_str()) {
        return Json(serde_json::json!({"ok": false, "erro": "Cliente inválido"}));
    }


    // Verificar sessão RDP activa (read lock rápido)
    let (sessao_id, server_ip) = {
        let st  = s.inner.read().await;
        let sid = st.rdp.get(&req.cliente)
            .and_then(|r| if r.ocupado { r.sessao_id } else { None });
        // Em failover usa o IP do reserva, caso contrário o IP original
        let ip = s.failover_ips.read().await
            .get(&req.cliente).cloned()
            .unwrap_or_else(|| s.rdp_client_ip(&req.cliente).unwrap_or("").to_string());
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
        let sups = if req.cliente == "eclusa_RG" {
            &mut st.supervisoes.eclusa_RG
        } else {
            &mut st.supervisoes.eclusa_PN
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

    tracing::info!(supervisor = %req.supervisor, cliente = %req.cliente, sessao_id, total_supervisores = total, "Supervisão iniciada");

    let db     = s.db.clone();
    let eclusa = if req.cliente == "eclusa_RG" { "Eclusa RG" } else { "Eclusa PN" };
    let msg    = format!("'{}' iniciou supervisão na {} (sessão RDP #{}, total supervisores: {})",
        req.supervisor, eclusa, sessao_id, total);
    tokio::spawn(async move { audit::log(&db, tipo::SUPERVISAO_INICIADA, &msg, None).await; });

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
    if !["eclusa_RG", "eclusa_PN"].contains(&req.cliente.as_str()) {
        return Json(serde_json::json!({"ok": false, "erro": "Cliente inválido"}));
    }

    {
        let mut st = s.inner.write().await;
        let sups = if req.cliente == "eclusa_RG" {
            &mut st.supervisoes.eclusa_RG
        } else {
            &mut st.supervisoes.eclusa_PN
        };
        sups.retain(|s| !s.supervisor.eq_ignore_ascii_case(&req.supervisor));
        broadcast_estado(&st, &s.sse_tx);
    }

    tracing::info!(supervisor = %req.supervisor, cliente = %req.cliente, "Supervisão encerrada");

    let db     = s.db.clone();
    let eclusa = if req.cliente == "eclusa_RG" { "Eclusa RG" } else { "Eclusa PN" };
    let msg    = if req.supervisor.eq_ignore_ascii_case(&auth.username) {
        format!("'{}' terminou supervisão na {}", req.supervisor, eclusa)
    } else {
        format!("Supervisão de '{}' na {} encerrada pelo administrador '{}'", req.supervisor, eclusa, auth.username)
    };
    tokio::spawn(async move { audit::log(&db, tipo::SUPERVISAO_ENCERRADA, &msg, None).await; });

    Json(serde_json::json!({"ok": true}))
}
