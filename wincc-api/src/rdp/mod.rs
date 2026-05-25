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

    loop {
        let clients: Vec<(String, String)> = state.rdp_clients
            .iter()
            .map(|c| (c.id.clone(), c.ip.clone()))
            .collect();

        // Clona cfg uma vez por ciclo — barato (só strings)
        let cfg = state.cfg.clone();

        // Verifica todos os clientes em paralelo — minimiza tempo total do ciclo
        let handles: Vec<_> = clients
            .iter()
            .map(|(_, ip)| {
                let ip  = ip.clone();
                let cfg = cfg.clone();
                tokio::task::spawn_blocking(move || verificar_rdp(&ip, &cfg))
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

                // Log e failover em mudança de estado
                if mudou_verificado && !info.verificado {
                    tracing::warn!(cliente = %cliente, ip = %ip, "RDP inacessível");

                    // Servidor caiu — se havia sessão ativa, notifica frontend para failover
                    let tem_sessao = match cliente.as_str() {
                        "cliente1" => st.sessoes.cliente1.conectado,
                        "cliente2" => st.sessoes.cliente2.conectado,
                        _          => false,
                    };
                    if tem_sessao {
                        let reserva_ip = state.cfg.reserva_ip.clone();
                        tracing::warn!(cliente = %cliente, reserva = %reserva_ip, "Failover — a redirecionar para servidor reserva");
                        let payload = serde_json::json!({
                            "tipo": "failover",
                            "cliente": cliente,
                            "ip_reserva": reserva_ip,
                        }).to_string();
                        let _ = state.sse_tx.send(format!("event: failover\ndata: {payload}\n\n"));
                    }
                } else if mudou_verificado && info.verificado {
                    tracing::info!(cliente = %cliente, ip = %ip, "RDP acessível");
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

    let mut success = false;
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
                "tsdiscon", &session_id.to_string(),
            ])
            .output();

        match cmd_result {
            Ok(o) if o.status.success() => {
                tracing::info!(sessao_id = session_id, servidor = %server_ip, "tsdiscon OK");
                success = true;
                break;
            }
            Ok(o) => {
                tracing::warn!(
                    tentativa = attempt,
                    codigo = ?o.status.code(),
                    servidor = %server_ip,
                    "tsdiscon falhou"
                );
                std::thread::sleep(Duration::from_millis(500));
            }
            Err(e) => {
                tracing::error!(tentativa = attempt, servidor = %server_ip, erro = %e, "tsdiscon erro");
                std::thread::sleep(Duration::from_millis(500));
            }
        }
    }

    if success {
        if let Some(client_ip) = obter_ip_cliente_rdp(server_ip, session_id, cfg) {
            bloquear_ip(server_ip, &client_ip, cfg);
            log_evento_bg(db, "bloqueio",
                &format!("IP {} bloqueado em {} (sessão {} de '{}')", client_ip, server_ip, session_id, utilizador));
        } else {
            tracing::warn!(servidor = %server_ip, sessao_id = session_id, "IP do cliente não obtido — firewall não aplicado");
        }
    }
}

// ── SSE broadcast ─────────────────────────────────────────────────────────────

/// Serializa estado completo e envia para todos os subscritores SSE.
/// Chamado enquanto write lock está activo — zero I/O, apenas serialização em memória.
pub fn broadcast_estado(st: &crate::state::AppStateInner, tx: &tokio::sync::broadcast::Sender<String>) {
    let json = serde_json::to_string(&serde_json::json!({
        "eclusas":     st.eclusas,   // direto da memória — sem leitura de disco
        "sessoes":     { "cliente1": st.sessoes.cliente1, "cliente2": st.sessoes.cliente2 },
        "rdp":         st.rdp,
        "supervisoes": { "cliente1": st.supervisoes.cliente1, "cliente2": st.supervisoes.cliente2 },
        "operadores":  st.operadores,
        "plc_health":  st.plc_health,
        "timestamp":   now()
    })).unwrap_or_default();

    let _ = tx.send(json);
}

/// Expõe desbloquear_ip para uso nos handlers
pub use firewall::desbloquear_ip as desbloquear_ip_firewall;
