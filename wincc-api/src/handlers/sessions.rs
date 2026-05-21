use axum::{
    extract::{ConnectInfo, State},
    response::sse::{Event, KeepAlive},
    response::Sse,
    Json,
};
use serde_json::Value;
use std::{convert::Infallible, net::SocketAddr};
use tokio_stream::{wrappers::BroadcastStream, Stream, StreamExt as _};

use crate::{
    auth::AuthUser,
    db::audit::{log_evento, log_evento_com_ip},
    rdp::{broadcast_estado, desbloquear_ip_firewall},
    state::Shared,
    types::{now, EncerrarReq, IniciarReq, Sessao},
};

/// GET /eventos — SSE stream com estado completo a cada mudança
pub async fn sse_eventos(State(s): State<Shared>) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = s.sse_tx.subscribe();
    let stream = BroadcastStream::new(rx)
        .filter_map(|r| r.ok())
        .map(|data| Ok::<Event, Infallible>(Event::default().data(data)));
    Sse::new(stream).keep_alive(KeepAlive::default())
}

/// GET /sessoes — estado das sessões activas (público — dashboard sem login)
pub async fn get_sessoes(State(s): State<Shared>) -> Json<Value> {
    let st = s.inner.read().await;
    Json(serde_json::json!({
        "cliente1": st.sessoes.cliente1,
        "cliente2": st.sessoes.cliente2
    }))
}

/// GET /estado — estado global completo (público — dashboard sem login)
pub async fn get_estado(State(s): State<Shared>) -> Json<Value> {
    let st = s.inner.read().await;
    Json(serde_json::json!({
        "eclusas":     st.eclusas,   // da memória — sem I/O de disco
        "sessoes":     { "cliente1": st.sessoes.cliente1, "cliente2": st.sessoes.cliente2 },
        "rdp":         st.rdp,
        "supervisoes": { "cliente1": st.supervisoes.cliente1, "cliente2": st.supervisoes.cliente2 },
        "operadores":  st.operadores,
        "plc_health":  st.plc_health,
        "timestamp":   now()
    }))
}

/// GET /sessoes/simples — formato texto para VBScript WinCC (sem auth — LAN only)
pub async fn sessoes_simples(State(s): State<Shared>) -> String {
    let st = s.inner.read().await;
    let rdp1 = st.rdp.get("cliente1").map(|r| r.ocupado).unwrap_or(false);
    let rdp2 = st.rdp.get("cliente2").map(|r| r.ocupado).unwrap_or(false);
    format!(
        "Cliente1={}\nCliente2={}\nCliente1_RDP={}\nCliente2_RDP={}\n",
        st.sessoes.cliente1.operador,
        st.sessoes.cliente2.operador,
        if rdp1 { "1" } else { "0" },
        if rdp2 { "1" } else { "0" },
    )
}

/// GET /sessoes/shadow — IDs e IPs das sessões RDP activas (sem auth — LAN only)
pub async fn shadow_simples(State(s): State<Shared>) -> String {
    let st = s.inner.read().await;

    let (sid1, ip1) = rdp_shadow_info(&st.rdp, "cliente1", &s);
    let (sid2, ip2) = rdp_shadow_info(&st.rdp, "cliente2", &s);

    format!(
        "Cliente1_SessaoId={}\nCliente1_Server={}\nCliente2_SessaoId={}\nCliente2_Server={}\n",
        sid1, ip1, sid2, ip2
    )
}

/// POST /sessoes/iniciar — inicia sessão RDP para operador
///
/// Optimizado para resposta rápida (<10ms em condições normais):
/// 1. Verificação de conta via DB (async, ~2ms com pool local)
/// 2. Write lock ÚNICO (check-and-set atómico — sem race condition)
/// 3. Desbloqueio firewall em background (não bloqueia response)
/// 4. Log de auditoria em background
pub async fn iniciar(
    State(s):          State<Shared>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    auth:              AuthUser,
    Json(req):         Json<IniciarReq>,
) -> Json<Value> {
    let caller_ip = addr.ip().to_string();

    // Validar cliente
    if !["cliente1", "cliente2"].contains(&req.cliente.as_str()) {
        return Json(serde_json::json!({"ok": false, "erro": "Cliente inválido"}));
    }

    // Verificar conta activa no PostgreSQL — async, sem lock
    let status: Option<String> = sqlx::query_scalar(
        "SELECT status::text AS status FROM users WHERE username = $1"
    )
    .bind(&auth.username)
    .fetch_optional(&s.db)
    .await
    .ok()
    .flatten();

    match status.as_deref() {
        Some("active") => {}
        Some(_) => return Json(serde_json::json!({"ok": false, "erro": "Conta bloqueada ou inactiva"})),
        None    => return Json(serde_json::json!({"ok": false, "erro": "Utilizador não encontrado"})),
    }

    // Verificar IP não bloqueado
    let ip_blocked: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM ip_blacklist \
         WHERE ip = $1::inet AND active = TRUE \
         AND (expires_at IS NULL OR expires_at > NOW()))"
    )
    .bind(&caller_ip)
    .fetch_one(&s.db)
    .await
    .unwrap_or(false);

    if ip_blocked {
        return Json(serde_json::json!({"ok": false, "erro": "IP bloqueado"}));
    }

    // ── CHECK-AND-SET ATÓMICO ──
    // Write lock desde o início: verificação + escrita numa operação indivisível.
    // Garante que dois requests simultâneos nunca colocam dois operadores no mesmo cliente.
    let mut st = s.inner.write().await;

    // Verificar operador não está noutro cliente
    let outro = if req.cliente == "cliente1" { "cliente2" } else { "cliente1" };
    let sessao_outro = if outro == "cliente1" { &st.sessoes.cliente1 } else { &st.sessoes.cliente2 };
    if sessao_outro.conectado && sessao_outro.operador.eq_ignore_ascii_case(&req.operador) {
        return Json(serde_json::json!({
            "ok": false,
            "erro": format!("Operador já tem sessão activa em {}", outro)
        }));
    }

    // Verificar cliente está livre
    let sessao_atual = if req.cliente == "cliente1" { &st.sessoes.cliente1 } else { &st.sessoes.cliente2 };
    if sessao_atual.conectado {
        return Json(serde_json::json!({
            "ok": false,
            "erro": format!("Cliente {} ocupado por {}", req.cliente, sessao_atual.operador)
        }));
    }

    // Obter IP do servidor RDP
    let server_ip = match s.rdp_client_ip(&req.cliente) {
        Some(ip) => ip.to_string(),
        None     => return Json(serde_json::json!({"ok": false, "erro": "Cliente não configurado"})),
    };

    // Escrever nova sessão (ainda sob write lock — atómico)
    let nova = Sessao {
        operador:         req.operador.clone(),
        timestamp_inicio: now(),
        conectado:        true,
    };
    if req.cliente == "cliente1" {
        st.sessoes.cliente1 = nova;
    } else {
        st.sessoes.cliente2 = nova;
    }
    broadcast_estado(&st, &s.sse_tx);
    // Write lock liberto aqui — duração mínima ✓

    // Desbloqueio firewall em background — não atrasa resposta ao frontend
    let cfg = s.cfg.clone();
    let caller_ip_bg = caller_ip.clone();
    let server_ip_bg = server_ip.clone();
    tokio::task::spawn_blocking(move || {
        desbloquear_ip_firewall(&server_ip_bg, &caller_ip_bg, &cfg);
    });

    // Audit log em background
    let db  = s.db.clone();
    let msg = format!("Sessão iniciada: {} em {} por {} (IP: {})", req.operador, req.cliente, auth.username, caller_ip);
    tokio::spawn(async move {
        log_evento_com_ip(&db, "sessao_iniciada", &msg, &caller_ip).await;
    });

    Json(serde_json::json!({"ok": true}))
}

/// POST /sessoes/encerrar — termina sessão RDP
pub async fn encerrar(
    State(s):   State<Shared>,
    auth:       AuthUser,
    Json(req):  Json<EncerrarReq>,
) -> Json<Value> {
    if !["cliente1", "cliente2"].contains(&req.cliente.as_str()) {
        return Json(serde_json::json!({"ok": false, "erro": "Cliente inválido"}));
    }

    // Capturar info da sessão RDP activa antes de limpar (read lock rápido)
    let (kill_info, operador) = {
        let st = s.inner.read().await;
        let op = if req.cliente == "cliente1" {
            st.sessoes.cliente1.operador.clone()
        } else {
            st.sessoes.cliente2.operador.clone()
        };
        let ki = st.rdp.get(&req.cliente)
            .filter(|r| r.ocupado && r.nome_sessao.starts_with("rdp-tcp#"))
            .and_then(|r| r.sessao_id)
            .and_then(|sid| s.rdp_client_ip(&req.cliente).map(|ip| (ip.to_string(), sid)));
        (ki, op)
    };

    // Verificar permissão: só o dono da sessão ou um admin pode encerrar
    let e_dono  = operador.eq_ignore_ascii_case(&auth.username);
    let e_admin = auth.role == "admin";
    if !e_dono && !e_admin {
        return Json(serde_json::json!({
            "ok":   false,
            "erro": "Sem permissão para encerrar esta sessão"
        }));
    }

    // Write lock — limpa sessão + supervisões
    {
        let mut st = s.inner.write().await;
        if req.cliente == "cliente1" {
            st.sessoes.cliente1     = Default::default();
            st.supervisoes.cliente1.clear();
        } else {
            st.sessoes.cliente2     = Default::default();
            st.supervisoes.cliente2.clear();
        }
        broadcast_estado(&st, &s.sse_tx);
    }

    // Desconectar sessão RDP em background
    if let Some((ip, sid)) = kill_info {
        tokio::task::spawn_blocking(move || {
            let _ = std::process::Command::new("tsdiscon")
                .args([&sid.to_string(), &format!("/server:{}", ip)])
                .output();
        });
    }

    // Audit log
    let db  = s.db.clone();
    let msg = format!("Sessão encerrada: {} em {} (por: {})", operador, req.cliente, auth.username);
    tokio::spawn(async move { log_evento(&db, "sessao_encerrada", &msg).await; });

    Json(serde_json::json!({"ok": true}))
}

// ── Helper ────────────────────────────────────────────────────────────────────

fn rdp_shadow_info(
    rdp: &crate::types::RdpMap,
    cliente: &str,
    s: &Shared,
) -> (u32, String) {
    let default_ip = s.rdp_client_ip(cliente).unwrap_or("").to_string();
    rdp.get(cliente)
        .filter(|r| r.ocupado)
        .and_then(|r| r.sessao_id.map(|sid| (sid, default_ip.clone())))
        .unwrap_or((0, default_ip))
}
