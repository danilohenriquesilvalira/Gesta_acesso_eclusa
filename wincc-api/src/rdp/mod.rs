pub mod firewall;
pub mod verify;

use std::time::Duration;
use tokio::time::sleep;

use crate::{
    config::STARTUP_GRACE_SECS,
    db::audit::{log_evento, log_evento_bg},
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

    // Contador de falhas consecutivas por cliente — apenas para logging
    let mut falhas_consecutivas: std::collections::HashMap<String, u32> = std::collections::HashMap::new();

    // Sessões já em processo de expulsão — evita disparar tsdiscon múltiplas vezes
    // enquanto o anterior ainda está a correr (chave: "ip:session_id")
    let mut em_expulsao: std::collections::HashSet<String> = std::collections::HashSet::new();

    loop {
        // IPs de failover ativos — se presente, monitoriza o reserva em vez do servidor principal
        let failover_ips: std::collections::HashMap<String, String> = {
            state.failover_ips.read().await.clone()
        };

        // Usa IP de failover se ativo, caso contrário o IP original do cliente
        let clients: Vec<(String, String)> = state.rdp_clients
            .iter()
            .map(|c| {
                let ip = failover_ips.get(&c.id).cloned().unwrap_or_else(|| c.ip.clone());
                (c.id.clone(), ip)
            })
            .collect();

        // Clona cfg uma vez por ciclo — barato (só strings)
        let cfg = state.cfg.clone();

        // Lê heartbeats uma vez por ciclo — sem lock durante o SSH
        // Em failover: usa ID do reserva para heartbeat, não o do cliente
        let heartbeats: std::collections::HashMap<String, std::time::Instant> = {
            state.heartbeats.read().await.clone()
        };

        // Lê sessões admin autorizadas — expiram após 10 min sem renovação
        let admin_rdp: std::collections::HashMap<String, std::time::Instant> = {
            let mut map = state.admin_rdp.write().await;
            map.retain(|_, t| t.elapsed().as_secs() < 600);
            map.clone()
        };

        // Mapa inverso IP→ID para encontrar heartbeat do reserva pelo IP
        let ip_to_id: std::collections::HashMap<String, String> = state.servidores
            .iter()
            .map(|s| (s.ip.clone(), s.id.clone()))
            .collect();

        // Verifica todos os clientes em paralelo — minimiza tempo total do ciclo
        let handles: Vec<_> = clients
            .iter()
            .map(|(cliente, ip)| {
                let ip      = ip.clone();
                let cfg     = cfg.clone();
                let cliente = cliente.clone();
                // Heartbeat: tenta pelo ID do cliente, depois pelo ID do servidor no IP atual
                let srv_id  = ip_to_id.get(&ip).cloned().unwrap_or_else(|| cliente.clone());
                let hb = heartbeats.get(&srv_id).copied()
                    .or_else(|| heartbeats.get(&cliente).copied());
                tokio::task::spawn_blocking(move || {
                    let hb_ok = hb.map(|t| t.elapsed().as_secs() < 5).unwrap_or(false);
                    if hb_ok {
                        let mut info = verificar_rdp(&ip, &cfg);
                        info.verificado = true;
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
        // Clientes com failover ativo — sessão ainda válida no reserva, não limpar
        let clientes_em_failover: std::collections::HashSet<String> = {
            state.failover_ips.read().await.keys().cloned().collect()
        };

        let mut kills: Vec<(String, u32, String)> = Vec::new(); // (ip, sid, utilizador)
        {
            let mut st = state.inner.write().await;
            let in_grace = st.startup
                .map(|s| s.elapsed().as_secs() <= STARTUP_GRACE_SECS)
                .unwrap_or(true);

            for ((cliente, ip), info) in clients.iter().zip(results.iter()) {
                let em_failover = clientes_em_failover.contains(cliente.as_str());

                // Em failover: o IP monitorado já é o reserva — sessão sempre registada
                // (failover_ips só existe quando a sessão foi registada no reserva)
                let registado = em_failover || match cliente.as_str() {
                    "eclusa_RG" => st.sessoes.eclusa_RG.conectado,
                    "eclusa_PN" => st.sessoes.eclusa_PN.conectado,
                    _           => false,
                };

                let nao_autorizado = info.ocupado && !registado;
                let prev             = st.rdp.get(cliente.as_str());
                let mudou_verificado = prev.map(|o| o.verificado != info.verificado).unwrap_or(true);
                let mudou_ocupado    = prev.map(|o| o.ocupado   != info.ocupado).unwrap_or(true);

                // Atualiza mapa RDP
                let mut new_info = info.clone();
                new_info.nao_autorizado = nao_autorizado;
                st.rdp.insert(cliente.clone(), new_info);

                // Auto-limpa sessão presa: só actua se o RDP está verificado, livre,
                // E a sessão tem mais de 30s (evita limpar durante o arranque do mstsc).
                // NUNCA limpa se o cliente está em failover — operador está no reserva.
                if !info.ocupado && info.verificado && !em_failover {
                    let (sessao, sups) = match cliente.as_str() {
                        "eclusa_RG" => (&st.sessoes.eclusa_RG, &st.supervisoes.eclusa_RG),
                        "eclusa_PN" => (&st.sessoes.eclusa_PN, &st.supervisoes.eclusa_PN),
                        _           => continue,
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
                            "eclusa_RG" => {
                                let op = st.sessoes.eclusa_RG.operador.clone();
                                tracing::info!(cliente = %cliente, operador = %op, "Sessão auto-encerrada — RDP livre há mais de 30s");
                                st.sessoes.eclusa_RG = Default::default();
                                let db  = state.db.clone();
                                let cli = cliente.clone();
                                tokio::spawn(async move {
                                    log_evento(&db, "sessao_auto_encerrada",
                                        &format!("Sessão auto-encerrada: operador '{}' em {} — RDP desligado há mais de 30s", op, cli)).await;
                                });
                            }
                            "eclusa_PN" => {
                                let op = st.sessoes.eclusa_PN.operador.clone();
                                tracing::info!(cliente = %cliente, operador = %op, "Sessão auto-encerrada — RDP livre há mais de 30s");
                                st.sessoes.eclusa_PN = Default::default();
                                let db  = state.db.clone();
                                let cli = cliente.clone();
                                tokio::spawn(async move {
                                    log_evento(&db, "sessao_auto_encerrada",
                                        &format!("Sessão auto-encerrada: operador '{}' em {} — RDP desligado há mais de 30s", op, cli)).await;
                                });
                            }
                            _ => {}
                        }
                    }
                    if !sups_vazias {
                        match cliente.as_str() {
                            "eclusa_RG" => { st.supervisoes.eclusa_RG.clear(); }
                            "eclusa_PN" => { st.supervisoes.eclusa_PN.clear(); }
                            _ => {}
                        }
                    }
                }

                // Regista falhas consecutivas — usado apenas para logging, o failover
                // é gerido exclusivamente pelo servidor_health_watchdog em main.rs,
                // que conhece todos os reservas e escolhe o melhor disponível.
                if !info.verificado {
                    let falhas = falhas_consecutivas.entry(cliente.clone()).or_insert(0);
                    *falhas += 1;
                    if *falhas == 1 {
                        tracing::warn!(cliente = %cliente, ip = %ip, "RDP inacessível");
                    }
                } else {
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

                // Isenção: admin autorizou RDP direto neste servidor (registo válido por 10 min)
                // Só isenta se o utilizador for o rdp_user (Administrator) — qualquer outro é expulso
                let e_admin_autorizado = nao_autorizado
                    && info.utilizador.eq_ignore_ascii_case(&cfg.rdp_user)
                    && admin_rdp.contains_key(ip.as_str());

                // Agendar desconexão de acesso não autorizado
                if !in_grace && nao_autorizado && !e_admin_autorizado {
                    if let Some(sid) = info.sessao_id {
                        if info.nome_sessao.starts_with("rdp-tcp") {
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

/// Desconecta sessão não autorizada e bloqueia IP no firewall.
/// Estratégia: obter IP do cliente (necessário antes de tsdiscon no Linux/SSH),
/// depois lançar tsdiscon + firewall em paralelo para mínima latência total.
fn disconnect_unauthorized(
    server_ip:  &str,
    session_id: u32,
    utilizador: &str,
    cfg:        &crate::config::Config,
    db:         &sqlx::PgPool,
) {
    log_evento_bg(db, "bloqueio",
        &format!("Acesso não autorizado: '{}' em {} sessão {} — a desconectar", utilizador, server_ip, session_id));

    // 1. Obter IP do cliente — necessário antes de tsdiscon (netstat deixa de mostrar após CLOSE_WAIT).
    //    Windows: WTS API é quase instantânea (~10ms). Linux: SSH netstat ~2-3s.
    let client_ip = obter_ip_cliente_rdp(server_ip, session_id, cfg);
    tracing::info!(servidor = %server_ip, sessao_id = session_id, ip_cliente = ?client_ip, "IP obtido");

    // 2. tsdiscon + firewall em paralelo — ambos correm ao mesmo tempo.
    let server_ip_owned  = server_ip.to_string();
    let utilizador_owned = utilizador.to_string();
    let cfg_fw  = cfg.clone();
    let cfg_dis = cfg.clone();
    let db_clone = db.clone();

    // Thread A: tsdiscon
    std::thread::spawn(move || {
        #[cfg(windows)]
        let result = std::process::Command::new("tsdiscon")
            .args([&session_id.to_string(), &format!("/server:{}", server_ip_owned)])
            .output();

        #[cfg(not(windows))]
        let result = std::process::Command::new("ssh")
            .args([
                "-i", &cfg_dis.ssh_key_path,
                "-p", &cfg_dis.ssh_port.to_string(),
                "-o", "StrictHostKeyChecking=no",
                "-o", "BatchMode=yes",
                "-o", "ConnectTimeout=5",
                &format!("{}@{}", cfg_dis.rdp_user, server_ip_owned),
                &format!("tsdiscon {}", session_id),
            ])
            .output();

        match result {
            Ok(o) => tracing::info!(sessao_id = session_id, servidor = %server_ip_owned, exit_code = ?o.status.code(), "tsdiscon executado"),
            Err(e) => tracing::error!(servidor = %server_ip_owned, erro = %e, "tsdiscon erro"),
        }
    });

    // Thread B: firewall + DB (só se temos o IP).
    // Captura o handle do runtime Tokio ANTES de entrar na thread OS —
    // dentro de std::thread::spawn não há contexto Tokio e tokio::spawn falharia.
    if let Some(ip) = client_ip {
        let server_ip_fw  = server_ip.to_string();
        let rt_handle     = tokio::runtime::Handle::current();
        std::thread::spawn(move || {
            bloquear_ip(&server_ip_fw, &ip, &cfg_fw);

            let reason   = format!("Acesso não autorizado: utilizador '{}' tentou aceder a {} — bloqueado automaticamente", utilizador_owned, server_ip_fw);
            let msg_log  = format!("IP {} bloqueado — tentou aceder a {} como '{}'", ip, server_ip_fw, utilizador_owned);
            let ip_clone       = ip.clone();
            let srv_clone      = server_ip_fw.clone();
            let user_clone     = utilizador_owned.clone();
            rt_handle.spawn(async move {
                let _ = sqlx::query(
                    "INSERT INTO ip_blacklist (ip, reason, servidor_ip, utilizador) \
                     SELECT $1::inet, $2, $3::inet, $4 \
                     WHERE NOT EXISTS (SELECT 1 FROM ip_blacklist WHERE ip = $1::inet AND active = TRUE)"
                )
                .bind(&ip_clone)
                .bind(&reason)
                .bind(&srv_clone)
                .bind(&user_clone)
                .execute(&db_clone)
                .await;

                log_evento(&db_clone, "bloqueio", &msg_log).await;
            });
        });
    } else {
        tracing::warn!(servidor = %server_ip, sessao_id = session_id, "IP do cliente não obtido — firewall não aplicado");
    }
}

// ── Poll de sessões não autorizadas nos servidores WinCC + reservas ──────────

/// Monitoriza todos os servidores (WinCC + reservas) para sessões RDP não autorizadas.
/// Qualquer sessão activa nestes servidores é não autorizada, excepto admin via rdp-direto.
pub async fn servidores_poll_loop(state: Shared) {
    let poll_interval = Duration::from_millis(crate::config::RDP_POLL_MS);
    let mut em_expulsao: std::collections::HashSet<String> = std::collections::HashSet::new();

    // IDs geridos pelo rdp_poll_loop com lógica própria de sessões — excluir aqui
    const GERIDOS_PELO_RDP_POLL: &[&str] = &["RG", "PN"];

    loop {
        let servidores: Vec<(String, String)> = state.servidores
            .iter()
            .filter(|s| !GERIDOS_PELO_RDP_POLL.contains(&s.id.as_str()))
            .map(|s| (s.id.clone(), s.ip.clone()))
            .collect();

        let cfg = state.cfg.clone();

        let admin_rdp: std::collections::HashMap<String, std::time::Instant> = {
            let map = state.admin_rdp.read().await;
            map.clone()
        };

        // IPs de failover ativos — sessões nestes IPs são de operadores legítimos
        // Exemplo: "eclusa_RG" → "172.29.164.15" significa que o Reserva01 tem sessão válida
        let failover_ips_ativos: std::collections::HashSet<String> = {
            state.failover_ips.read().await.values().cloned().collect()
        };

        let in_grace = {
            let st = state.inner.read().await;
            st.startup.map(|s| s.elapsed().as_secs() <= crate::config::STARTUP_GRACE_SECS).unwrap_or(true)
        };

        // Verifica todos os servidores em paralelo
        let handles: Vec<_> = servidores
            .iter()
            .map(|(id, ip)| {
                let ip  = ip.clone();
                let cfg = cfg.clone();
                let id  = id.clone();
                let hb  = {
                    let hbs = state.heartbeats.try_read().ok()
                        .and_then(|h| h.get(&id).copied());
                    hbs
                };
                tokio::task::spawn_blocking(move || {
                    let hb_ok = hb.map(|t| t.elapsed().as_secs() < 5).unwrap_or(false);
                    if hb_ok {
                        let mut info = verificar_rdp(&ip, &cfg);
                        info.verificado = true;
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

        let mut kills: Vec<(String, u32, String)> = Vec::new();

        for ((id, ip), info) in servidores.iter().zip(results.iter()) {
            if !info.ocupado || !info.verificado { continue; }

            // Isenção 1: servidor está em uso como failover de um cliente legítimo
            if failover_ips_ativos.contains(ip.as_str()) {
                em_expulsao.retain(|k| !k.starts_with(&format!("{}:", ip)));
                continue;
            }

            // Isenção 2: admin com RDP direto autorizado
            let e_admin_autorizado = info.utilizador.eq_ignore_ascii_case(&cfg.rdp_user)
                && admin_rdp.get(ip.as_str())
                    .map(|t| t.elapsed().as_secs() < 600)
                    .unwrap_or(false);

            if e_admin_autorizado { continue; }

            if !in_grace {
                if let Some(sid) = info.sessao_id {
                    if info.nome_sessao.starts_with("rdp-tcp#") {
                        let chave = format!("{}:{}", ip, sid);
                        if !em_expulsao.contains(&chave) {
                            em_expulsao.insert(chave);
                            tracing::warn!(
                                servidor = %id,
                                ip = %ip,
                                utilizador = %info.utilizador,
                                sessao_id = sid,
                                "Acesso não autorizado em servidor WinCC/Reserva — a desconectar"
                            );
                            kills.push((ip.clone(), sid, info.utilizador.clone()));
                        }
                    }
                }
            }
        }

        // Limpar expulsões de sessões que já não existem
        for ((_, ip), info) in servidores.iter().zip(results.iter()) {
            if !info.ocupado {
                em_expulsao.retain(|k| !k.starts_with(&format!("{}:", ip)));
            } else if let Some(sid) = info.sessao_id {
                let e_admin = info.utilizador.eq_ignore_ascii_case(&cfg.rdp_user)
                    && admin_rdp.get(ip.as_str())
                        .map(|t| t.elapsed().as_secs() < 600)
                        .unwrap_or(false);
                let e_failover = failover_ips_ativos.contains(ip.as_str());
                if e_admin || e_failover {
                    em_expulsao.remove(&format!("{}:{}", ip, sid));
                }
            }
        }

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

// ── SSE broadcast ─────────────────────────────────────────────────────────────

/// Serializa estado completo e envia para todos os subscritores SSE.
/// Chamado enquanto write lock está activo — zero I/O, apenas serialização em memória.
pub fn broadcast_estado(st: &crate::state::AppStateInner, tx: &tokio::sync::broadcast::Sender<String>) {
    let json = serde_json::to_string(&serde_json::json!({
        "eclusas":          st.eclusas,
        "sessoes":          { "eclusa_RG": st.sessoes.eclusa_RG, "eclusa_PN": st.sessoes.eclusa_PN },
        "rdp":              st.rdp,
        "supervisoes":      { "eclusa_RG": st.supervisoes.eclusa_RG, "eclusa_PN": st.supervisoes.eclusa_PN },
        "operadores":       st.operadores,
        "plc_health":       st.plc_health,
        "servidor_health":  st.servidor_health,
        "timestamp":        now()
    })).unwrap_or_default();

    let _ = tx.send(json);
}

/// Expõe desbloquear_ip para uso nos handlers
pub use firewall::desbloquear_ip as desbloquear_ip_firewall;
