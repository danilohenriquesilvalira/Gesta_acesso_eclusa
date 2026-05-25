pub mod firewall;
pub mod verify;

use std::time::Duration;
use tokio::time::sleep;

use crate::{
    config::STARTUP_GRACE_SECS,
    db::audit::log_evento_bg,
    state::Shared,
    types::{now, RdpInfo},
};

use self::{
    firewall::bloquear_ip,
    verify::{obter_ip_cliente_rdp, verificar_rdp},
};

/// Background task — corre para sempre, polling RDP de todos os clientes em paralelo.
/// Usa spawn_blocking para não bloquear o runtime Tokio com chamadas síncronas ao SO.
pub async fn rdp_poll_loop(state: Shared) {
    let poll_interval = Duration::from_millis(crate::config::RDP_POLL_MS);

    // Contador de falhas consecutivas por cliente — failover dispara ao atingir limite
    let mut falhas_consecutivas: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    // Número de falhas para confirmar servidor inacessível (3 × 1.5s = ~4.5s)
    const FALHAS_PARA_FAILOVER: u32 = 3;

    // Sessões já em processo de expulsão — evita disparar tsdiscon múltiplas vezes
    // enquanto o anterior ainda está a correr (chave: "ip:session_id")
    let mut em_expulsao: std::collections::HashSet<String> = std::collections::HashSet::new();

    loop {
        let clients: Vec<(String, String)> = state.rdp_clients
            .iter()
            .map(|c| (c.id.clone(), c.ip.clone()))
            .collect();

        // Clona cfg uma vez por ciclo — barato (só strings)
        let cfg = state.cfg.clone();

        // Lê heartbeats uma vez por ciclo — sem lock durante o SSH
        let heartbeats: std::collections::HashMap<String, std::time::Instant> = {
            state.heartbeats.read().await.clone()
        };

        // Verifica todos os clientes em paralelo — minimiza tempo total do ciclo
        let handles: Vec<_> = clients
            .iter()
            .map(|(cliente, ip)| {
                let ip       = ip.clone();
                let cfg      = cfg.clone();
                let cliente  = cliente.clone();
                let hb       = heartbeats.get(&cliente).copied();
                tokio::task::spawn_blocking(move || {
                    // Se agente heartbeat instalado e recente (<5s) → servidor vivo
                    // Ainda faz SSH para obter info da sessão RDP
                    // Se heartbeat ausente ou antigo → usa SSH para verificar
                    let hb_ok = hb.map(|t| t.elapsed().as_secs() < 5).unwrap_or(false);
                    if hb_ok {
                        // Servidor confirmado vivo pelo agente — faz SSH só para sessão RDP
                        let mut info = verificar_rdp(&ip, &cfg);
                        info.verificado = true; // agente confirma
                        info
                    } else {
                        verificar_rdp(&ip, &cfg)
                    }
                })
            })
            .collect();

        let results: Vec<RdpInfo> = futures::future::join_all(handles)
            .await
            .into_iter()
            .map(|r| r.unwrap_or_default())
            .collect();

        // Processa resultados sob write lock — operação rápida (só memória)
        let mut kills: Vec<(String, u32, String)> = Vec::new(); // (ip, sid, utilizador)
        {
            let mut st = state.inner.write().await;
            let in_grace = st.startup
                .map(|s| s.elapsed().as_secs() <= STARTUP_GRACE_SECS)
                .unwrap_or(true);

            for ((cliente, ip), info) in clients.iter().zip(results.iter()) {
                let registado = match cliente.as_str() {
                    "cliente1" => st.sessoes.cliente1.conectado,
                    "cliente2" => st.sessoes.cliente2.conectado,
                    _          => false,
                };

                let nao_autorizado   = info.ocupado && !registado;
                let prev             = st.rdp.get(cliente.as_str());
                let mudou_verificado = prev.map(|o| o.verificado != info.verificado).unwrap_or(true);
                let mudou_ocupado    = prev.map(|o| o.ocupado   != info.ocupado).unwrap_or(true);

                // Atualiza mapa RDP
                let mut new_info = info.clone();
                new_info.nao_autorizado = nao_autorizado;
                st.rdp.insert(cliente.clone(), new_info);

                // Auto-limpa sessão presa: só actua se o RDP está verificado, livre,
                // E a sessão tem mais de 30s (evita limpar durante o arranque do mstsc)
                if !info.ocupado && info.verificado {
                    let (sessao, sups) = match cliente.as_str() {
                        "cliente1" => (&st.sessoes.cliente1, &st.supervisoes.cliente1),
                        "cliente2" => (&st.sessoes.cliente2, &st.supervisoes.cliente2),
                        _          => continue,
                    };
                    let sessao_velha = sessao.conectado && !sessao.timestamp_inicio.is_empty() && {
                        chrono::DateTime::parse_from_str(
                            &format!("{} +0000", sessao.timestamp_inicio),
                            "%Y-%m-%d %H:%M:%S %z"
                        ).map(|t| chrono::Utc::now().signed_duration_since(t).num_seconds() > 30)
                        .unwrap_or(false)
                    };
                    let sups_vazias = sups.is_empty();
                    drop(sessao); drop(sups);

                    if sessao_velha {
                        match cliente.as_str() {
                            "cliente1" => {
                                tracing::info!(cliente = %cliente, operador = %st.sessoes.cliente1.operador, "Sessão auto-encerrada — RDP livre há mais de 30s");
                                st.sessoes.cliente1 = Default::default();
                            }
                            "cliente2" => {
                                tracing::info!(cliente = %cliente, operador = %st.sessoes.cliente2.operador, "Sessão auto-encerrada — RDP livre há mais de 30s");
                                st.sessoes.cliente2 = Default::default();
                            }
                            _ => {}
                        }
                    }
                    if !sups_vazias {
                        match cliente.as_str() {
                            "cliente1" => { st.supervisoes.cliente1.clear(); }
                            "cliente2" => { st.supervisoes.cliente2.clear(); }
                            _ => {}
                        }
                    }
                }

                // Contador de falhas consecutivas — failover só dispara após N falhas
                if !info.verificado {
                    let falhas = falhas_consecutivas.entry(cliente.clone()).or_insert(0);
                    *falhas += 1;

                    if *falhas == 1 {
                        tracing::warn!(cliente = %cliente, ip = %ip, "RDP inacessível");
                    }

                    // Após N falhas confirmadas → failover
                    if *falhas == FALHAS_PARA_FAILOVER {
                        let reserva_ip = state.cfg.reserva_ip.clone();
                        tracing::warn!(
                            cliente = %cliente,
                            ip = %ip,
                            reserva = %reserva_ip,
                            falhas = FALHAS_PARA_FAILOVER,
                            "Servidor inacessível confirmado — failover para servidor reserva"
                        );
                        let payload = serde_json::json!({
                            "_event": "failover",
                            "cliente": cliente,
                            "ip_reserva": reserva_ip,
                        }).to_string();
                        let _ = state.sse_tx.send(payload);
                    }
                } else {
                    // Servidor voltou — reset contador
                    if falhas_consecutivas.get(cliente).copied().unwrap_or(0) > 0 {
                        tracing::info!(cliente = %cliente, ip = %ip, "RDP acessível — servidor recuperado");
                    }
                    falhas_consecutivas.insert(cliente.clone(), 0);
                    if mudou_verificado {
                        tracing::info!(cliente = %cliente, ip = %ip, "RDP acessível");
                    }
                }
                if mudou_ocupado {
                    if info.ocupado {
                        tracing::info!(cliente = %cliente, utilizador = %info.utilizador, "RDP ocupado");
                    } else if info.verificado {
                        tracing::info!(cliente = %cliente, "RDP livre");
                    }
                }

                // Agendar desconexão de acesso não autorizado
                if !in_grace && nao_autorizado {
                    if let Some(sid) = info.sessao_id {
                        if info.nome_sessao.starts_with("rdp-tcp#") {
                            let chave = format!("{}:{}", ip, sid);
                            if !em_expulsao.contains(&chave) {
                                em_expulsao.insert(chave);
                                tracing::warn!(
                                    utilizador = %info.utilizador,
                                    ip = %ip,
                                    sessao_id = sid,
                                    "Acesso não autorizado — a desconectar"
                                );
                                kills.push((ip.clone(), sid, info.utilizador.clone()));
                            }
                        }
                    }
                } else {
                    // Sessão encerrada ou autorizada — remover do set de expulsão
                    if let Some(sid) = info.sessao_id {
                        em_expulsao.remove(&format!("{}:{}", ip, sid));
                    }
                    if !nao_autorizado {
                        // Limpar todas as entradas deste ip quando fica autorizado/livre
                        em_expulsao.retain(|k| !k.starts_with(&format!("{}:", ip)));
                    }
                }
            }

            // Broadcast estado actualizado para todos os dashboards SSE
            broadcast_estado(&st, &state.sse_tx);
        }

        // Desconexões em background
        for (ip, sid, utilizador) in kills {
            let cfg = state.cfg.clone();
            let db  = state.db.clone();
            tokio::task::spawn_blocking(move || {
                disconnect_unauthorized(&ip, sid, &utilizador, &cfg, &db);
            });
        }
        sleep(poll_interval).await;
    }
}

/// Desconecta sessão não autorizada com retry e bloqueia IP no firewall.
/// Windows: tsdiscon nativo
/// Linux:   ssh user@ip tsdiscon <sid>
fn disconnect_unauthorized(
    server_ip:  &str,
    session_id: u32,
    utilizador: &str,
    cfg:        &crate::config::Config,
    db:         &sqlx::PgPool,
) {
    log_evento_bg(db, "bloqueio",
        &format!("Acesso não autorizado: '{}' em {} sessão {} — a desconectar", utilizador, server_ip, session_id));

    // 1. Obter IP do cliente ANTES de desconectar — após tsdiscon a ligação passa a
    //    CLOSE_WAIT e já não aparece como ESTABLISHED no netstat.
    let client_ip = obter_ip_cliente_rdp(server_ip, session_id, cfg);
    tracing::info!(
        servidor = %server_ip,
        sessao_id = session_id,
        ip_cliente = ?client_ip,
        "IP do cliente obtido antes de tsdiscon"
    );

    // 2. Bloquear IP NO FIREWALL IMEDIATAMENTE — antes mesmo do tsdiscon.
    //    Assim mesmo que o tsdiscon falhe ou demore, o cliente não consegue
    //    reconectar enquanto o tsdiscon ainda está a correr.
    if let Some(ref ip) = client_ip {
        bloquear_ip(server_ip, ip, cfg);
        log_evento_bg(db, "bloqueio",
            &format!("IP {} bloqueado em {} (sessão {} de '{}')", ip, server_ip, session_id, utilizador));
    } else {
        tracing::warn!(servidor = %server_ip, sessao_id = session_id, "IP do cliente não obtido — firewall não aplicado");
    }

    // 3. Desconectar sessão (tsdiscon) — mesmo que o firewall já bloqueou,
    //    isto remove a sessão da lista do servidor.
    for attempt in 1..=3u8 {
        #[cfg(windows)]
        let cmd_result = std::process::Command::new("tsdiscon")
            .args([&session_id.to_string(), &format!("/server:{}", server_ip)])
            .output();

        #[cfg(not(windows))]
        let cmd_result = std::process::Command::new("ssh")
            .args([
                "-i", &cfg.ssh_key_path,
                "-p", &cfg.ssh_port.to_string(),
                "-o", "StrictHostKeyChecking=no",
                "-o", "BatchMode=yes",
                "-o", "ConnectTimeout=5",
                &format!("{}@{}", cfg.rdp_user, server_ip),
                &format!("tsdiscon {}", session_id),
            ])
            .output();

        match cmd_result {
            Ok(o) => {
                tracing::info!(
                    tentativa = attempt,
                    sessao_id = session_id,
                    servidor = %server_ip,
                    exit_code = ?o.status.code(),
                    stderr = %String::from_utf8_lossy(&o.stderr),
                    "tsdiscon executado"
                );
                break; // Não repetir — tsdiscon não tem retry útil
            }
            Err(e) => {
                tracing::error!(tentativa = attempt, servidor = %server_ip, erro = %e, "tsdiscon erro");
                if attempt < 3 { std::thread::sleep(Duration::from_millis(500)); }
            }
        }
    }
}

// ── SSE broadcast ─────────────────────────────────────────────────────────────

/// Serializa estado completo e envia para todos os subscritores SSE.
/// Chamado enquanto write lock está activo — zero I/O, apenas serialização em memória.
pub fn broadcast_estado(st: &crate::state::AppStateInner, tx: &tokio::sync::broadcast::Sender<String>) {
    let json = serde_json::to_string(&serde_json::json!({
        "eclusas":          st.eclusas,
        "sessoes":          { "cliente1": st.sessoes.cliente1, "cliente2": st.sessoes.cliente2 },
        "rdp":              st.rdp,
        "supervisoes":      { "cliente1": st.supervisoes.cliente1, "cliente2": st.supervisoes.cliente2 },
        "operadores":       st.operadores,
        "plc_health":       st.plc_health,
        "servidor_health":  st.servidor_health,
        "timestamp":        now()
    })).unwrap_or_default();

    let _ = tx.send(json);
}

/// Expõe desbloquear_ip para uso nos handlers
pub use firewall::desbloquear_ip as desbloquear_ip_firewall;
