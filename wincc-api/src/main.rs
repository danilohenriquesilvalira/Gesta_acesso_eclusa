mod auth;
mod config;
mod db;
mod failover;
mod handlers;
mod plc;
mod rdp;
mod state;
mod types;

use axum::{
    error_handling::HandleErrorLayer,
    http::StatusCode,
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
    misc::{add_operador, del_operador, get_logs, get_operadores, health},
    sessions::{encerrar, get_estado, get_sessoes, iniciar, sessoes_simples, shadow_simples, sse_eventos},
    stream::{get_mjpeg, post_frame, ws_viewer},
    supervisao::{encerrar_supervisao, iniciar_supervisao},
    users::{
        add_blacklist, admin_force_logout, auth_login, auth_logout, create_usuario,
        delete_usuario, get_usuario, list_blacklist, list_usuarios, remove_blacklist,
        update_usuario,
    },
};
use handlers::misc::{heartbeat, wincc_status};
use rdp::rdp_poll_loop;
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
    loop {
        tokio::time::sleep(Duration::from_secs(3)).await;

        let heartbeats = state.heartbeats.read().await.clone();
        let mut st     = state.inner.write().await;
        let mut mudou  = false;

        for (srv, health) in st.servidor_health.iter_mut() {
            let hb_ok = heartbeats.get(srv)
                .map(|t| t.elapsed().as_secs() < TIMEOUT_SECS)
                .unwrap_or(false);

            if health.windows_vivo != hb_ok {
                health.windows_vivo = hb_ok;
                if !hb_ok { health.wincc_vivo = false; } // se Windows morreu, WinCC também
                mudou = true;
                if hb_ok {
                    tracing::info!(servidor = %srv, "Servidor ONLINE");
                } else {
                    tracing::warn!(servidor = %srv, "Servidor OFFLINE — heartbeat parou");
                }
            }
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

    // ── Startup: limpa firewall + configura shadow RDP em cada servidor ─────
    for client in &state.rdp_clients {
        let ip  = client.ip.clone();
        let cfg = cfg.clone();
        tokio::task::spawn(async move {
            tokio::task::spawn_blocking(move || {
                rdp::firewall::limpar_todos_bloqueios(&ip, &cfg);
                rdp::firewall::configurar_shadow(&ip, &cfg);
            }).await.ok();
        });
    }

    // ── Background tasks ──────────────────────────────────────────────────────
    tokio::spawn(rdp_poll_loop(state.clone()));
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
    let app = Router::new()
        // ── Público — sem autenticação ────────────────────────────────────────
        .route("/health",                    get(health))
        .route("/auth/login",                post(auth_login))
        .route("/auth/logout",               post(auth_logout))
        .route("/eventos",                   get(sse_eventos))
        // ── Streaming — sem auth (LAN only, WinCC Streamer) ───────────────────
        .route("/stream/:cliente/frame",     post(post_frame))
        .route("/stream/:cliente/mjpeg",     get(get_mjpeg))
        .route("/stream/:cliente/ws",        get(ws_viewer))
        // ── Eclusas — WinCC escreve estado, sem auth (LAN only) ───────────────
        .route("/eclusas",                   get(get_eclusas))
        .route("/eclusas/:id/estado",        post(atualizar_eclusa))
        // ── Protegido — requer JWT válido ─────────────────────────────────────
        .route("/estado",                    get(get_estado))
        .route("/sessoes",                   get(get_sessoes))
        .route("/sessoes/simples",           get(sessoes_simples))
        .route("/sessoes/shadow",            get(shadow_simples))
        .route("/sessoes/iniciar",           post(iniciar))
        .route("/sessoes/encerrar",          post(encerrar))
        .route("/supervisao/iniciar",        post(iniciar_supervisao))
        .route("/supervisao/encerrar",       post(encerrar_supervisao))
        .route("/operadores",                get(get_operadores).post(add_operador))
        .route("/operadores/:nome",          delete(del_operador))
        .route("/logs",                      get(get_logs))
        // ── Admin only ────────────────────────────────────────────────────────
        .route("/usuarios",                  get(list_usuarios).post(create_usuario))
        .route("/usuarios/:username",        get(get_usuario).put(update_usuario).delete(delete_usuario))
        .route("/blacklist",                 get(list_blacklist).post(add_blacklist))
        .route("/blacklist/:id",             delete(remove_blacklist))
        .route("/admin/force-logout",        post(admin_force_logout))
        // ── Heartbeat — wincc-agent em cada Windows Server (sem auth, LAN only) ─
        .route("/heartbeat/:servidor",        post(heartbeat))
        .route("/wincc-status/:servidor",    post(wincc_status))
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
