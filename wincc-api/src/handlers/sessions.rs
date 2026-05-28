use axum::{
    extract::{ConnectInfo, Query, State},
    http::StatusCode,
    response::sse::{Event, KeepAlive},
    response::{IntoResponse, Sse},
    Json,
};
use serde::Deserialize;
use serde_json::Value;
use std::{convert::Infallible, net::SocketAddr};
use tokio_stream::{wrappers::BroadcastStream, StreamExt as _};

use crate::{
    auth::{verify_token, AuthUser},
    db::audit::{self, tipo},
    rdp::{broadcast_estado, desbloquear_ip_firewall},
    state::Shared,
    types::{now, EncerrarReq, IniciarReq, Sessao},
};

#[derive(Deserialize)]
pub struct TokenQuery {
    pub token: Option<String>,
}

/// GET /eventos?token=<jwt> — SSE stream com estado completo a cada mudança.
/// Requer JWT válido via query string (EventSource não suporta headers).
pub async fn sse_eventos(
    State(s):    State<Shared>,
    Query(q):    Query<TokenQuery>,
) -> impl IntoResponse {
    let token = match q.token {
        Some(t) if !t.is_empty() => t,
        _ => return (StatusCode::UNAUTHORIZED, "Token em falta").into_response(),
    };

    let claims = match verify_token(&token, &s.cfg.jwt_secret) {
        Some(c) => c,
        None    => return (StatusCode::UNAUTHORIZED, "Token inválido ou expirado").into_response(),
    };

    // Verificar revogação (cache em memória)
    {
        let cache = s.revoked_jtis.read().await;
        if let Some(&exp_ts) = cache.get(&claims.jti) {
            if chrono::Utc::now().timestamp() < exp_ts {
                return (StatusCode::UNAUTHORIZED, "Sessão revogada").into_response();
            }
        }
    }

    let rx = s.sse_tx.subscribe();
    let stream = BroadcastStream::new(rx)
        .filter_map(|r| r.ok())
        .map(|data| Ok::<Event, Infallible>(Event::default().data(data)));
    Sse::new(stream).keep_alive(KeepAlive::default()).into_response()
}

/// GET /sessoes — estado das sessões activas (público — dashboard sem login)
pub async fn get_sessoes(State(s): State<Shared>) -> Json<Value> {
    let st = s.inner.read().await;
    Json(serde_json::json!({
        "eclusa_RG": st.sessoes.eclusa_RG,
        "eclusa_PN": st.sessoes.eclusa_PN
    }))
}

/// GET /estado — estado global completo (público — dashboard sem login)
pub async fn get_estado(State(s): State<Shared>) -> Json<Value> {
    let st = s.inner.read().await;
    Json(serde_json::json!({
        "eclusas":     st.eclusas,
        "sessoes":     { "eclusa_RG": st.sessoes.eclusa_RG, "eclusa_PN": st.sessoes.eclusa_PN },
        "rdp":         st.rdp,
        "supervisoes": { "eclusa_RG": st.supervisoes.eclusa_RG, "eclusa_PN": st.supervisoes.eclusa_PN },
        "operadores":  st.operadores,
        "plc_health":  st.plc_health,
        "timestamp":   now()
    }))
}

/// GET /sessoes/simples — formato texto para VBScript WinCC (sem auth — LAN only)
pub async fn sessoes_simples(State(s): State<Shared>) -> String {
    let st = s.inner.read().await;
    let rdp_rg = st.rdp.get("eclusa_RG").map(|r| r.ocupado).unwrap_or(false);
    let rdp_pn = st.rdp.get("eclusa_PN").map(|r| r.ocupado).unwrap_or(false);
    format!(
        "EclusaRG={}\nEclusaPN={}\nEclusaRG_RDP={}\nEclusaPN_RDP={}\n",
        st.sessoes.eclusa_RG.operador,
        st.sessoes.eclusa_PN.operador,
        if rdp_rg { "1" } else { "0" },
        if rdp_pn { "1" } else { "0" },
    )
}

/// GET /sessoes/shadow — IDs e IPs das sessões RDP activas (sem auth — LAN only)
pub async fn shadow_simples(State(s): State<Shared>) -> String {
    let st           = s.inner.read().await;
    let failover_ips = s.failover_ips.read().await;

    let (sid1, ip1) = rdp_shadow_info(&st.rdp, "eclusa_RG", &s, &failover_ips);
    let (sid2, ip2) = rdp_shadow_info(&st.rdp, "eclusa_PN", &s, &failover_ips);

    format!(
        "EclusaRG_SessaoId={}\nEclusaRG_Server={}\nEclusaPN_SessaoId={}\nEclusaPN_Server={}\n",
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
    if !["eclusa_RG", "eclusa_PN"].contains(&req.cliente.as_str()) {
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

    // ── CHECK-AND-SET ATÓMICO ──
    // Write lock desde o início: verificação + escrita numa operação indivisível.
    // Garante que dois requests simultâneos nunca colocam dois operadores no mesmo cliente.
    let mut st = s.inner.write().await;

    // Verificar operador não está noutro cliente
    let outro = if req.cliente == "eclusa_RG" { "eclusa_PN" } else { "eclusa_RG" };
    let sessao_outro = if outro == "eclusa_RG" { &st.sessoes.eclusa_RG } else { &st.sessoes.eclusa_PN };
    if sessao_outro.conectado && sessao_outro.operador.eq_ignore_ascii_case(&req.operador) {
        return Json(serde_json::json!({
            "ok": false,
            "erro": format!("Operador já tem sessão activa em {}", outro)
        }));
    }

    // Verificar cliente está livre — ou é o mesmo operador a retomar (failover/retorno)
    let sessao_atual = if req.cliente == "eclusa_RG" { &st.sessoes.eclusa_RG } else { &st.sessoes.eclusa_PN };
    if sessao_atual.conectado && !sessao_atual.operador.eq_ignore_ascii_case(&req.operador) {
        return Json(serde_json::json!({
            "ok": false,
            "erro": format!("Eclusa {} ocupada por {}", req.cliente, sessao_atual.operador)
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
    if req.cliente == "eclusa_RG" {
        st.sessoes.eclusa_RG = nova;
    } else {
        st.sessoes.eclusa_PN = nova;
    }
    broadcast_estado(&st, &s.sse_tx);
    drop(st); // liberta write lock antes de qualquer outro await
    // Write lock liberto — duração mínima ✓

    // Se o frontend especificou IP de failover, registar após libertar o lock principal
    let ip_srv_opt = req.ip_servidor.clone();
    if let Some(ref ip_srv) = ip_srv_opt {
        if !ip_srv.is_empty() && *ip_srv != server_ip {
            s.failover_ips.write().await
                .insert(req.cliente.clone(), ip_srv.clone());
        }
    }

    // Desbloquear IP na DB — await directo para que o frontend já veja o estado correcto
    {
        let r = sqlx::query(
            "UPDATE ip_blacklist SET active = FALSE, expires_at = NOW() \
             WHERE ip >>= $1::inet AND active = TRUE"
        )
        .bind(&caller_ip)
        .execute(&s.db)
        .await;
        if let Ok(res) = r {
            if res.rows_affected() > 0 {
                tracing::info!(ip = %caller_ip, "ip_blacklist desbloqueado ao iniciar sessão");
            }
        }
    }

    // Desbloqueio firewall + logoff de todas as sessões RDP anteriores em background.
    // Usa PowerShell remoto via SSH para obter todos os IDs de sessão (incluindo
    // Disconnected que o qwinsta normal ignora) e faz logoff de cada um.
    // Garante que o operador nunca vê o dialog "Select a session to reconnect to".
    let cfg = s.cfg.clone();
    let caller_ip_bg = caller_ip.clone();
    let server_ip_bg = server_ip.clone();
    tokio::task::spawn_blocking(move || {
        desbloquear_ip_firewall(&server_ip_bg, &caller_ip_bg, &cfg);
        // Logoff de todas as sessões RDP (Active + Disconnected) via SSH
        // O comando PowerShell lista IDs e faz logoff de cada um em sequência
        #[cfg(not(windows))]
        let _ = std::process::Command::new("ssh")
            .args([
                "-i", &cfg.ssh_key_path,
                "-p", &cfg.ssh_port.to_string(),
                "-o", "StrictHostKeyChecking=no",
                "-o", "BatchMode=yes",
                "-o", "ConnectTimeout=5",
                &format!("{}@{}", cfg.rdp_user, server_ip_bg),
                "for /f \"skip=1 tokens=3\" %i in ('qwinsta') do @logoff %i 2>nul",
            ])
            .output();
        #[cfg(windows)]
        let _ = std::process::Command::new("wmic")
            .args([
                &format!("/node:{}", server_ip_bg),
                &format!("/user:{}", cfg.rdp_user),
                &format!("/password:{}", cfg.rdp_password),
                "process", "call", "create",
                "cmd /c for /f \"skip=1 tokens=3\" %i in ('qwinsta') do @logoff %i 2>nul",
            ])
            .output();
        tracing::info!(servidor = %server_ip_bg, "Sessões RDP anteriores encerradas antes de nova ligação");
    });

    // Audit log em background
    let db       = s.db.clone();
    let eclusa   = if req.cliente == "eclusa_RG" { "Eclusa RG" } else { "Eclusa PN" };
    let msg      = format!("'{}' iniciou sessão na {} (acesso por '{}')", req.operador, eclusa, auth.username);
    let ip_clone = caller_ip.clone();
    tokio::spawn(async move {
        audit::log(&db, tipo::SESSAO_INICIADA, &msg, Some(&ip_clone)).await;
    });

    Json(serde_json::json!({"ok": true}))
}

/// POST /sessoes/encerrar — termina sessão RDP
pub async fn encerrar(
    State(s):   State<Shared>,
    auth:       AuthUser,
    Json(req):  Json<EncerrarReq>,
) -> Json<Value> {
    if !["eclusa_RG", "eclusa_PN"].contains(&req.cliente.as_str()) {
        return Json(serde_json::json!({"ok": false, "erro": "Cliente inválido"}));
    }

    // Capturar info da sessão RDP activa antes de limpar (read lock rápido)
    let (kill_info, operador) = {
        let st = s.inner.read().await;
        let op = if req.cliente == "eclusa_RG" {
            st.sessoes.eclusa_RG.operador.clone()
        } else {
            st.sessoes.eclusa_PN.operador.clone()
        };
        // Em failover usa o IP do reserva para o logoff
        let server_ip = s.failover_ips.read().await
            .get(&req.cliente).cloned()
            .unwrap_or_else(|| s.rdp_client_ip(&req.cliente).unwrap_or("").to_string());
        let ki = st.rdp.get(&req.cliente)
            .filter(|r| r.ocupado && r.nome_sessao.starts_with("rdp-tcp#"))
            .and_then(|r| r.sessao_id)
            .map(|sid| (server_ip, sid));
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
        if req.cliente == "eclusa_RG" {
            st.sessoes.eclusa_RG     = Default::default();
            st.supervisoes.eclusa_RG.clear();
        } else {
            st.sessoes.eclusa_PN     = Default::default();
            st.supervisoes.eclusa_PN.clear();
        }
        broadcast_estado(&st, &s.sse_tx);
    }

    // Limpa failover ativo para este cliente (sessão encerrada = voltou ao normal)
    s.failover_ips.write().await.remove(&req.cliente);

    // Terminar sessão RDP em background — logoff destrói a sessão, tsdiscon só desconecta
    if let Some((ip, sid)) = kill_info {
        tokio::task::spawn_blocking(move || {
            let _ = std::process::Command::new("logoff")
                .args([&sid.to_string(), &format!("/server:{}", ip)])
                .output();
        });
    }

    // Audit log
    let db     = s.db.clone();
    let eclusa = if req.cliente == "eclusa_RG" { "Eclusa RG" } else { "Eclusa PN" };
    let msg    = if operador.eq_ignore_ascii_case(&auth.username) {
        format!("'{}' encerrou a própria sessão na {}", auth.username, eclusa)
    } else {
        format!("Sessão de '{}' na {} encerrada pelo administrador '{}'", operador, eclusa, auth.username)
    };
    tokio::spawn(async move { audit::log(&db, tipo::SESSAO_ENCERRADA, &msg, None).await; });

    Json(serde_json::json!({"ok": true}))
}

/// POST /sessoes/encerrar-agente — chamado pelo wincc-agent quando WinCC activa bit Encerrar_Sessao.
/// Autenticado por agent-secret fixo (sem JWT) — LAN only, sem exposição externa.
/// Identifica o cliente pelo IP de origem do pedido (o servidor Windows que enviou).
pub async fn encerrar_agente(
    State(s):          State<Shared>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(req):         Json<serde_json::Value>,
) -> Json<Value> {
    // Verificar agent-secret
    let secret = req.get("secret").and_then(|v| v.as_str()).unwrap_or("");
    let expected = s.cfg.agent_secret.as_deref().unwrap_or("wincc-agent-secret-edp");
    if secret != expected {
        return Json(serde_json::json!({"ok": false, "erro": "Não autorizado"}));
    }

    // Identificar cliente pelo IP de origem
    let caller_ip = addr.ip().to_string();
    let cliente = s.rdp_clients.iter()
        .find(|c| c.ip == caller_ip)
        .map(|c| c.id.clone());

    // Também verificar failover_ips — agente pode estar num reserva
    let cliente = match cliente {
        Some(c) => c,
        None => {
            let fips = s.failover_ips.read().await;
            let found = fips.iter().find(|(_, ip)| *ip == &caller_ip).map(|(k, _)| k.clone());
            match found {
                Some(c) => c,
                None => {
                    tracing::warn!(ip = %caller_ip, "encerrar-agente: IP não reconhecido");
                    return Json(serde_json::json!({"ok": false, "erro": "Servidor não reconhecido"}));
                }
            }
        }
    };

    // Capturar info da sessão
    let (kill_info, operador) = {
        let st = s.inner.read().await;
        let op = if cliente == "eclusa_RG" {
            st.sessoes.eclusa_RG.operador.clone()
        } else {
            st.sessoes.eclusa_PN.operador.clone()
        };
        let server_ip = s.failover_ips.read().await
            .get(&cliente).cloned()
            .unwrap_or_else(|| s.rdp_client_ip(&cliente).unwrap_or("").to_string());
        let ki = st.rdp.get(&cliente)
            .filter(|r| r.ocupado && r.nome_sessao.starts_with("rdp-tcp#"))
            .and_then(|r| r.sessao_id)
            .map(|sid| (server_ip, sid));
        (ki, op)
    };

    // 1. Emitir SSE "fechar_rdp" ANTES do logoff — Tauri fecha mstsc silenciosamente
    //    evita que o Windows mostre o dialog "Sessão encerrada pelo administrador"
    let sse_payload = serde_json::json!({
        "_event": "fechar_rdp",
        "cliente": cliente,
    }).to_string();
    let _ = s.sse_tx.send(sse_payload);

    // 2. Aguardar 1.5s para o Tauri fechar o mstsc antes do logoff chegar
    tokio::time::sleep(std::time::Duration::from_millis(1500)).await;

    // 3. Limpar sessão + supervisões
    {
        let mut st = s.inner.write().await;
        if cliente == "eclusa_RG" {
            st.sessoes.eclusa_RG     = Default::default();
            st.supervisoes.eclusa_RG.clear();
        } else {
            st.sessoes.eclusa_PN     = Default::default();
            st.supervisoes.eclusa_PN.clear();
        }
        broadcast_estado(&st, &s.sse_tx);
    }
    s.failover_ips.write().await.remove(&cliente);

    // 4. Logoff no servidor (mstsc já fechou — sem dialog para o operador)
    if let Some((ip, sid)) = kill_info {
        tokio::task::spawn_blocking(move || {
            let _ = std::process::Command::new("logoff")
                .args([&sid.to_string(), &format!("/server:{}", ip)])
                .output();
        });
    }

    let db     = s.db.clone();
    let eclusa = if cliente == "eclusa_RG" { "Eclusa RG" } else { "Eclusa PN" };
    let msg    = format!("Sessão de '{}' na {} encerrada pelo WinCC (activação do bit Encerrar_Sessão)", operador, eclusa);
    tokio::spawn(async move { audit::log(&db, tipo::SESSAO_ENCERRADA_WINCC, &msg, None).await; });

    tracing::info!(cliente = %cliente, operador = %operador, "Sessão encerrada por WinCC");
    Json(serde_json::json!({"ok": true}))
}

/// POST /sessoes/voltar-original — frontend confirma que reconectou ao servidor original.
/// Limpa failover_ips para este cliente (o reserva fica livre).
pub async fn voltar_original(
    State(s):  State<Shared>,
    auth:      AuthUser,
    Json(req): Json<EncerrarReq>, // reutiliza { cliente }
) -> Json<serde_json::Value> {
    if !["eclusa_RG", "eclusa_PN"].contains(&req.cliente.as_str()) {
        return Json(serde_json::json!({"ok": false, "erro": "Cliente inválido"}));
    }
    s.failover_ips.write().await.remove(&req.cliente);
    tracing::info!(cliente = %req.cliente, operador = %auth.username, "failover_ips limpo — voltou ao servidor original");

    let db  = s.db.clone();
    let op  = auth.username.clone();
    let eclusa = if req.cliente == "eclusa_RG" { "Eclusa RG" } else { "Eclusa PN" };
    let msg_ret = format!("'{}' reconectou à {} no servidor original — failover encerrado", op, eclusa);
    tokio::spawn(async move {
        audit::log(&db, tipo::SESSAO_RETORNO_ORIGINAL, &msg_ret, None).await;
    });

    Json(serde_json::json!({"ok": true}))
}

// ── Helper ────────────────────────────────────────────────────────────────────

fn rdp_shadow_info(
    rdp: &crate::types::RdpMap,
    cliente: &str,
    s: &Shared,
    failover_ips: &std::collections::HashMap<String, String>,
) -> (u32, String) {
    // Em failover usa o IP do reserva; caso contrário o IP original do cliente
    let ip = failover_ips.get(cliente).cloned()
        .unwrap_or_else(|| s.rdp_client_ip(cliente).unwrap_or("").to_string());
    rdp.get(cliente)
        .filter(|r| r.ocupado)
        .and_then(|r| r.sessao_id.map(|sid| (sid, ip.clone())))
        .unwrap_or((0, ip))
}
