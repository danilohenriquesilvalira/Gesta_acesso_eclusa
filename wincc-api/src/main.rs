mod auth;
mod config;
mod db;
mod failover;
mod handlers;
mod middleware;
mod plc;
mod rdp;
mod state;
mod types;

use axum::{
    error_handling::HandleErrorLayer,
    http::StatusCode,
    middleware as axum_middleware,
    routing::{delete, get, post},
    Router,
};
use std::{net::SocketAddr, time::Duration};
use tower::ServiceBuilder;
use tower_http::{
    compression::CompressionLayer,
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};

use config::load_config;
use db::{bootstrap_admin_if_needed, cleanup_loop, create_pool, load_operadores, verify_schema};
use handlers::{
    eclusas::{atualizar_eclusa, get_eclusas, ler_eclusas_do_disco},
    misc::{add_operador, admin_rdp_direto, del_operador, get_logs, get_operadores, health},
    plc::{get_dados_plc, receber_dados_plc},
    sessions::{encerrar, encerrar_agente, get_estado, get_sessoes, iniciar, sessoes_simples, shadow_simples, sse_eventos, voltar_original},
    stream::{get_mjpeg, post_frame, ws_viewer},
    supervisao::{encerrar_supervisao, iniciar_supervisao},
    users::{
        add_blacklist, admin_force_logout, auth_login, auth_logout, create_usuario,
        delete_usuario, get_usuario, list_blacklist, list_usuarios, remove_blacklist,
        update_usuario,
    },
};
use handlers::misc::{heartbeat, wincc_status};
use rdp::{rdp_poll_loop, servidores_poll_loop};
use state::AppState;

// ── Tracing ───────────────────────────────────────────────────────────────────

fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "wincc_api=info,tower_http=warn".into()),
        )
        .with_target(false)
        .compact()
        .init();
}

// ── Graceful shutdown — SIGTERM (Linux/Docker) + Ctrl+C ──────────────────────

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("Falha ao instalar handler Ctrl+C");
    };

    #[cfg(unix)]
    {
        let terminate = async {
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("Falha ao instalar handler SIGTERM")
                .recv()
                .await;
        };
        tokio::select! {
            _ = ctrl_c    => {}
            _ = terminate => {}
        }
    }

    #[cfg(not(unix))]
    ctrl_c.await;
}

// ── Watchdog: marca windows_vivo=false se heartbeat parar há mais de 5s ──────

async fn servidor_health_watchdog(state: state::Shared) {
    const TIMEOUT_SECS: u64 = 5;

    // IDs dos servidores reserva — por ordem de prioridade
    const RESERVAS: &[&str] = &["Reserva01", "Reserva02", "Reserva03"];
    // IDs dos servidores de produção que têm WinCC
    const PRODUCAO: &[&str] = &["RG", "PN", "CL", "CM", "VR"];

    // Rastreia estado anterior para detetar transições
    let mut anterior: std::collections::HashMap<String, (bool, bool)> = std::collections::HashMap::new();

    loop {
        tokio::time::sleep(Duration::from_secs(3)).await;

        let heartbeats = state.heartbeats.read().await.clone();
        let mut st     = state.inner.write().await;
        let mut mudou  = false;

        // 1. Atualiza windows_vivo com base nos heartbeats
        for (srv, health) in st.servidor_health.iter_mut() {
            let hb_ok = heartbeats.get(srv)
                .map(|t| t.elapsed().as_secs() < TIMEOUT_SECS)
                .unwrap_or(false);

            if health.windows_vivo != hb_ok {
                health.windows_vivo = hb_ok;
                if !hb_ok { health.wincc_vivo = false; }
                mudou = true;
                if hb_ok {
                    tracing::info!(servidor = %srv, "Servidor ONLINE");
                } else {
                    tracing::warn!(servidor = %srv, "Servidor OFFLINE — heartbeat parou");
                }
            }
        }

        // 2. Deteta transições e emite eventos SSE de failover / retorno
        let snapshot: Vec<(String, String, bool, bool)> = st.servidor_health
            .iter()
            .map(|(id, h)| (id.clone(), h.ip.clone(), h.windows_vivo, h.wincc_vivo))
            .collect();

        // Reserva disponível = windows_vivo=true E wincc_vivo=true (WinCC já a correr)
        let reserva_disponivel: Option<(String, String)> = RESERVAS.iter()
            .find(|&&r| snapshot.iter().any(|(id, _, wv, wcv)| id == r && *wv && *wcv))
            .and_then(|r| {
                snapshot.iter()
                    .find(|(id, _, _, _)| id == r)
                    .map(|(id, ip, _, _)| (id.clone(), ip.clone()))
            });

        for (id, ip_original, windows_vivo, wincc_vivo) in &snapshot {
            if !PRODUCAO.contains(&id.as_str()) { continue; }

            let agora = (*windows_vivo, *wincc_vivo);

            // Primeira iteração — inicializa e verifica já se há failover pendente
            let prev = match anterior.get(id).copied() {
                Some(p) => p,
                None => {
                    anterior.insert(id.clone(), agora);
                    // Se arrancou com servidor já degradado, trata como "caiu"
                    // para não perder transições que aconteceram antes do arranque
                    if !agora.0 || !agora.1 {
                        anterior.insert(id.clone(), (true, true));
                    }
                    continue;
                }
            };

            // Servidor caiu (windows OU wincc ficou false)
            let caiu = (prev.0 && !agora.0) || (prev.1 && !agora.1);
            if caiu {
                // Dispara failover se há sessão registada OU se o RDP estava ocupado
                // (o rdp_poll_loop pode limpar sessoes.conectado antes do watchdog detetar a queda)
                let cliente_ativo = {
                    let sessao_ok = match id.as_str() {
                        "RG" => st.sessoes.eclusa_RG.conectado,
                        "PN" => st.sessoes.eclusa_PN.conectado,
                        _    => false,
                    };
                    let rdp_chave = match id.as_str() {
                        "RG" => "eclusa_RG",
                        "PN" => "eclusa_PN",
                        _    => "",
                    };
                    let rdp_ocupado = st.rdp.get(rdp_chave).map(|r| r.ocupado).unwrap_or(false);
                    sessao_ok || rdp_ocupado
                };

                if let Some((ref id_reserva, ref ip_reserva)) = reserva_disponivel {
                    // Regista IP de failover — rdp_poll_loop passa a monitorizar o reserva
                    let cliente_key = match id.as_str() {
                        "RG" => "eclusa_RG",
                        "PN" => "eclusa_PN",
                        _    => "",
                    };
                    if !cliente_key.is_empty() {
                        state.failover_ips.write().await
                            .insert(cliente_key.to_string(), ip_reserva.clone());
                    }
                    if cliente_ativo {
                        let payload = serde_json::json!({
                            "_event":      "failover",
                            "servidor":    id,
                            "ip_original": ip_original,
                            "ip_reserva":  ip_reserva,
                            "id_reserva":  id_reserva,
                            "motivo":      if !agora.0 { "windows_offline" } else { "wincc_offline" },
                        }).to_string();
                        let _ = state.sse_tx.send(payload);
                        tracing::warn!(servidor = %id, reserva = %id_reserva, ip_reserva = %ip_reserva, "SSE failover enviado — cliente ativo");
                    } else {
                        tracing::warn!(servidor = %id, reserva = %id_reserva, "Servidor caiu — failover_ips atualizado, sem cliente ativo para reconectar");
                    }
                } else {
                    tracing::error!(servidor = %id, "Servidor caiu mas SEM reserva disponivel com WinCC online — failover impossivel");
                }
            }

            // Servidor voltou (ambos true após ter estado offline)
            if (!prev.0 || !prev.1) && agora.0 && agora.1 {
                let cliente_key = match id.as_str() {
                    "RG" => "eclusa_RG",
                    "PN" => "eclusa_PN",
                    _    => "",
                };

                // Verificar se há sessão ativa no reserva para este cliente
                // e obter o operador registado — só esse PC deve reconectar
                let (tem_sessao_no_reserva, operador_no_reserva) = if !cliente_key.is_empty() {
                    let em_failover = state.failover_ips.read().await.contains_key(cliente_key);
                    let (sessao_ativa, operador) = match id.as_str() {
                        "RG" => (st.sessoes.eclusa_RG.conectado, st.sessoes.eclusa_RG.operador.clone()),
                        "PN" => (st.sessoes.eclusa_PN.conectado, st.sessoes.eclusa_PN.operador.clone()),
                        _    => (false, String::new()),
                    };
                    (em_failover && sessao_ativa, operador)
                } else {
                    (false, String::new())
                };

                if tem_sessao_no_reserva {
                    // Há operador no reserva — emite evento com o nome do operador.
                    // Cada Tauri verifica se o operador local coincide; só o PC correto reconecta.
                    let payload = serde_json::json!({
                        "_event":          "servidor_voltou",
                        "servidor":        id,
                        "ip_original":     ip_original,
                        "cliente_key":     cliente_key,
                        "reconectar_auto": true,
                        "operador":        operador_no_reserva,
                    }).to_string();
                    let _ = state.sse_tx.send(payload);
                    tracing::info!(servidor = %id, ip = %ip_original, "SSE servidor_voltou — reconexão automática em curso");

                    // Timeout de segurança: se o frontend não confirmar via /sessoes/voltar-original
                    // em 30s, limpa failover_ips automaticamente para desbloquear o reserva.
                    let state_clone  = state.clone();
                    let ck           = cliente_key.to_string();
                    tokio::spawn(async move {
                        tokio::time::sleep(Duration::from_secs(30)).await;
                        let mut fips = state_clone.failover_ips.write().await;
                        if fips.contains_key(&ck) {
                            fips.remove(&ck);
                            tracing::warn!(cliente = %ck, "failover_ips limpo por timeout (frontend não confirmou em 30s)");
                        }
                    });
                } else {
                    // Sem sessão ativa no reserva — limpa failover imediatamente
                    if !cliente_key.is_empty() {
                        state.failover_ips.write().await.remove(cliente_key);
                    }
                    let payload = serde_json::json!({
                        "_event":          "servidor_voltou",
                        "servidor":        id,
                        "ip_original":     ip_original,
                        "cliente_key":     cliente_key,
                        "reconectar_auto": false,
                    }).to_string();
                    let _ = state.sse_tx.send(payload);
                    tracing::info!(servidor = %id, ip = %ip_original, "SSE servidor_voltou — sem sessão ativa, failover_ips limpo");
                }
            }

            anterior.insert(id.clone(), agora);
        }

        if mudou {
            rdp::broadcast_estado(&st, &state.sse_tx);
        }
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    init_tracing();

    let cfg = load_config();

    // ── PostgreSQL ────────────────────────────────────────────────────────────
    let db = create_pool(&cfg.database_url).await;
    verify_schema(&db).await;
    bootstrap_admin_if_needed(&db).await;
    let operadores = load_operadores(&db).await;

    // ── Estado inicial das eclusas (única leitura de disco em toda a vida da app)
    let eclusas_iniciais = ler_eclusas_do_disco();

    // ── AppState — construído uma vez, partilhado por Arc ─────────────────────
    let state = AppState::new(db, cfg.clone(), operadores, eclusas_iniciais);

    // ── Startup: limpa firewall + configura shadow + sessão única em todos os servidores ──
    let todos_servidores: Vec<String> = state.rdp_clients.iter().map(|c| c.ip.clone())
        .chain(state.servidores.iter().map(|s| s.ip.clone()))
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    for ip in todos_servidores {
        let cfg = cfg.clone();
        tokio::task::spawn(async move {
            tokio::task::spawn_blocking(move || {
                rdp::firewall::limpar_todos_bloqueios(&ip, &cfg);
                rdp::firewall::configurar_shadow(&ip, &cfg);
                rdp::firewall::configurar_sessao_unica(&ip, &cfg);
            }).await.ok();
        });
    }

    // ── Background tasks ──────────────────────────────────────────────────────
    tokio::spawn(rdp_poll_loop(state.clone()));
    tokio::spawn(servidores_poll_loop(state.clone()));
    tokio::spawn(plc::plc_health_loop(state.clone()));
    tokio::spawn(failover::failover_monitor_loop(state.clone()));
    tokio::spawn(cleanup_loop(state.clone()));
    tokio::spawn(servidor_health_watchdog(state.clone()));

    // ── Middleware ────────────────────────────────────────────────────────────
    let cors        = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);
    let compression = CompressionLayer::new();

    // Timeout de 30s — protege o servidor de handlers suspensos indefinidamente
    let timeout_layer = ServiceBuilder::new()
        .layer(HandleErrorLayer::new(|_: tower::BoxError| async {
            StatusCode::REQUEST_TIMEOUT
        }))
        .timeout(Duration::from_secs(30));

    // ── Router ────────────────────────────────────────────────────────────────

    // Rotas LAN-only: sem JWT, aceitas apenas de 172.29.x.x / 10.10.x.x / loopback
    let lan_routes = Router::new()
        .route("/stream/:cliente/frame",     post(post_frame))
        .route("/eclusas/:id/estado",        post(atualizar_eclusa))
        .route("/plc/dados",                 post(receber_dados_plc))
        .route("/heartbeat/:servidor",       post(heartbeat))
        .route("/wincc-status/:servidor",    post(wincc_status))
        .layer(axum_middleware::from_fn(middleware::apenas_lan));

    // Rotas públicas: abertas a todos os IPs (login, health, SSE, leitura)
    let public_routes = Router::new()
        .route("/health",                    get(health))
        .route("/auth/login",                post(auth_login))
        .route("/auth/logout",               post(auth_logout))
        .route("/eventos",                   get(sse_eventos))
        .route("/stream/:cliente/mjpeg",     get(get_mjpeg))
        .route("/stream/:cliente/ws",        get(ws_viewer))
        .route("/eclusas",                   get(get_eclusas));

    // Rotas protegidas: requerem JWT válido (validado dentro dos handlers)
    let protected_routes = Router::new()
        .route("/estado",                    get(get_estado))
        .route("/sessoes",                   get(get_sessoes))
        .route("/sessoes/simples",           get(sessoes_simples))
        .route("/sessoes/shadow",            get(shadow_simples))
        .route("/sessoes/iniciar",           post(iniciar))
        .route("/sessoes/encerrar",          post(encerrar))
        .route("/sessoes/voltar-original",   post(voltar_original))
        .route("/sessoes/encerrar-agente",   post(encerrar_agente))
        .route("/supervisao/iniciar",        post(iniciar_supervisao))
        .route("/supervisao/encerrar",       post(encerrar_supervisao))
        .route("/operadores",                get(get_operadores).post(add_operador))
        .route("/operadores/:nome",          delete(del_operador))
        .route("/logs",                      get(get_logs))
        .route("/plc/dados",                 get(get_dados_plc))
        .route("/usuarios",                  get(list_usuarios).post(create_usuario))
        .route("/usuarios/:username",        get(get_usuario).put(update_usuario).delete(delete_usuario))
        .route("/blacklist",                 get(list_blacklist).post(add_blacklist))
        .route("/blacklist/:id",             delete(remove_blacklist))
        .route("/admin/force-logout",        post(admin_force_logout))
        .route("/admin/rdp-direto",          post(admin_rdp_direto));

    let app = Router::new()
        .merge(lan_routes)
        .merge(public_routes)
        .merge(protected_routes)
        .with_state(state)
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .layer(compression)
        .layer(timeout_layer);

    let addr = format!("0.0.0.0:{}", cfg.api_port);

    tracing::info!("WinCC API v0.3 — EDP Gestão de Acesso a Eclusas");
    tracing::info!(endereco = %addr, pool_db = config::DB_POOL_MAX, poll_rdp_ms = config::RDP_POLL_MS, "Servidor a iniciar");

    // ── Canal de shutdown graceful (watch channel — clone por iteração de loop)
    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);

    tokio::spawn(async move {
        shutdown_signal().await;
        tracing::info!("Sinal de terminação recebido — graceful shutdown iniciado");
        let _ = shutdown_tx.send(true);
    });

    // ── Serve com auto-restart em caso de erro de rede ────────────────────────
    let mut restart_count: u32 = 0;
    loop {
        if *shutdown_rx.borrow() { break; }

        let listener = match tokio::net::TcpListener::bind(&addr).await {
            Ok(l) => {
                restart_count = 0;
                l
            }
            Err(e) => {
                restart_count += 1;
                tracing::error!(endereco = %addr, erro = %e, restart = restart_count, "Erro ao fazer bind");
                if restart_count >= 10 {
                    tracing::error!("10 falhas consecutivas — a terminar processo");
                    std::process::exit(1);
                }
                tokio::time::sleep(Duration::from_secs(5)).await;
                continue;
            }
        };

        tracing::info!(endereco = %addr, "A escutar");

        let mut rx = shutdown_rx.clone();
        let result = axum::serve(
            listener,
            app.clone().into_make_service_with_connect_info::<SocketAddr>(),
        )
        .with_graceful_shutdown(async move {
            rx.wait_for(|v| *v).await.ok();
        })
        .await;

        if *shutdown_rx.borrow() {
            tracing::info!("Graceful shutdown concluído — processo a terminar");
            break;
        }

        if let Err(e) = result {
            tracing::error!(erro = %e, "Servidor parou inesperadamente — reiniciar em 2s");
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    }
}
