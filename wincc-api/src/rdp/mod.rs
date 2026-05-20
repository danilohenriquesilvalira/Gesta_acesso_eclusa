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

        // Verifica todos os clientes em paralelo — minimize tempo total do ciclo
        let handles: Vec<_> = clients
            .iter()
            .map(|(_, ip)| {
                let ip = ip.clone();
                tokio::task::spawn_blocking(move || verificar_rdp(&ip))
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
            let mut st   = state.inner.write().await;
            let in_grace = st.startup
                .map(|s| s.elapsed().as_secs() <= STARTUP_GRACE_SECS)
                .unwrap_or(true);

            for ((cliente, ip), info) in clients.iter().zip(results.iter()) {
                let registado = match cliente.as_str() {
                    "cliente1" => st.sessoes.cliente1.conectado,
                    "cliente2" => st.sessoes.cliente2.conectado,
                    _          => false,
                };

                let nao_autorizado  = info.ocupado && !registado;
                let prev            = st.rdp.get(cliente.as_str());
                let mudou_verificado = prev.map(|o| o.verificado != info.verificado).unwrap_or(true);
                let mudou_ocupado    = prev.map(|o| o.ocupado   != info.ocupado).unwrap_or(true);

                // Atualiza mapa RDP
                let mut new_info = info.clone();
                new_info.nao_autorizado = nao_autorizado;
                st.rdp.insert(cliente.clone(), new_info);

                // Auto-limpa supervisões quando sessão RDP termina
                if !info.ocupado {
                    let sups = match cliente.as_str() {
                        "cliente1" => &mut st.supervisoes.cliente1,
                        "cliente2" => &mut st.supervisoes.cliente2,
                        _          => continue,
                    };
                    if !sups.is_empty() {
                        eprintln!("[{}] Supervisão auto-encerrada (RDP livre) em {}", now(), cliente);
                        sups.clear();
                    }
                }

                // Log apenas em mudança de estado — nunca em loop
                if mudou_verificado && !info.verificado {
                    eprintln!("[{}] RDP {}: INACESSÍVEL ({})", now(), cliente, ip);
                } else if mudou_verificado && info.verificado {
                    eprintln!("[{}] RDP {}: ACESSÍVEL ({})", now(), cliente, ip);
                }
                if mudou_ocupado {
                    if info.ocupado {
                        eprintln!("[{}] RDP {}: OCUPADO — {}", now(), cliente, info.utilizador);
                    } else if info.verificado {
                        eprintln!("[{}] RDP {}: LIVRE", now(), cliente);
                    }
                }

                // Agendar desconexão de acesso não autorizado (apenas Windows — usa tsdiscon/WTS)
                #[cfg(windows)]
                if !in_grace && nao_autorizado {
                    if let Some(sid) = info.sessao_id {
                        if info.nome_sessao.starts_with("rdp-tcp#") {
                            eprintln!("[{}] NÃO AUTORIZADO: '{}' em {} — a desconectar", now(), info.utilizador, ip);
                            kills.push((ip.clone(), sid, info.utilizador.clone()));
                        }
                    }
                }
            }

            // Broadcast estado actualizado para todos os dashboards SSE
            broadcast_estado(&st, &state.sse_tx);
        }

        // Desconexões em background (Windows only)
        #[cfg(windows)]
        for (ip, sid, utilizador) in kills {
            let cfg  = state.cfg.clone();
            let db   = state.db.clone();
            tokio::task::spawn_blocking(move || {
                disconnect_unauthorized(&ip, sid, &utilizador, &cfg, &db);
            });
        }
        #[cfg(not(windows))]
        let _ = kills;

        sleep(poll_interval).await;
    }
}

/// Desconecta sessão não autorizada com retry e bloqueia IP no firewall (Windows only).
#[cfg(windows)]
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
        match std::process::Command::new("tsdiscon")
            .args([&session_id.to_string(), &format!("/server:{}", server_ip)])
            .output()
        {
            Ok(o) if o.status.success() => {
                eprintln!("[{}] tsdiscon OK sessão {} em {}", now(), session_id, server_ip);
                success = true;
                break;
            }
            Ok(o) => {
                eprintln!("[{}] tsdiscon tentativa {} falhou (código {:?}) em {}", now(), attempt, o.status.code(), server_ip);
                std::thread::sleep(Duration::from_millis(500));
            }
            Err(e) => {
                eprintln!("[{}] tsdiscon erro tentativa {} em {}: {}", now(), attempt, server_ip, e);
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
            eprintln!("[{}] IP do cliente não obtido em {} — firewall não aplicado", now(), server_ip);
        }
    }
}

// ── SSE broadcast ─────────────────────────────────────────────────────────────

/// Serializa estado completo e envia para todos os subscritores SSE.
/// Deve ser chamado sempre que estado muda, enquanto write lock está activo.
pub fn broadcast_estado(st: &crate::state::AppStateInner, tx: &tokio::sync::broadcast::Sender<String>) {
    use crate::handlers::eclusas::ler_eclusas;

    let json = serde_json::to_string(&serde_json::json!({
        "eclusas":     ler_eclusas(),
        "sessoes":     { "cliente1": st.sessoes.cliente1, "cliente2": st.sessoes.cliente2 },
        "rdp":         st.rdp,
        "supervisoes": { "cliente1": st.supervisoes.cliente1, "cliente2": st.supervisoes.cliente2 },
        "operadores":  st.operadores,
        "plc_health":  st.plc_health,
        "timestamp":   now()
    })).unwrap_or_default();

    // Erro silenciado intencionalmente: se não há subscritores, não há problema
    let _ = tx.send(json);
}

/// Expõe desbloquear_ip para uso nos handlers (quando sessão é iniciada legitimamente)
pub use firewall::desbloquear_ip as desbloquear_ip_firewall;
