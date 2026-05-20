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
    routing::{delete, get, post},
    Router,
};
use std::net::SocketAddr;
use tower_http::{compression::CompressionLayer, cors::{Any, CorsLayer}};

use config::load_config;
use db::{bootstrap_admin_if_needed, cleanup_loop, create_pool, load_operadores, verify_schema};
use handlers::{
    eclusas::{atualizar_eclusa, get_eclusas},
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
use rdp::rdp_poll_loop;
use state::AppState;
use types::now;

#[tokio::main]
async fn main() {
    let cfg = load_config();

    // ── PostgreSQL ────────────────────────────────────────────────────────────
    let db = create_pool(&cfg.database_url).await;
    verify_schema(&db).await;
    bootstrap_admin_if_needed(&db).await;
    let operadores = load_operadores(&db).await;

    // ── AppState — construído uma vez, partilhado por Arc ─────────────────────
    let state = AppState::new(db, cfg.clone(), operadores);

    // ── Startup: limpa firewall + shadow em background (Windows only)
    #[cfg(windows)]
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

    // ── Router ────────────────────────────────────────────────────────────────
    let cors        = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);
    let compression = CompressionLayer::new();

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
        .with_state(state)
        .layer(cors)
        .layer(compression);

    let addr = format!("0.0.0.0:{}", cfg.api_port);

    eprintln!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    eprintln!(" WinCC API  —  EDP Gestão de Acesso a Eclusas  v0.3");
    eprintln!(" Endereço   :  http://{}", addr);
    eprintln!(" Base dados :  PostgreSQL  (pool = {})", config::DB_POOL_MAX);
    eprintln!(" Poll RDP   :  {} ms", config::RDP_POLL_MS);
    eprintln!(" PLCs       :  5  (heartbeat = {} ms)", config::PLC_HEARTBEAT_MS);
    eprintln!(" Failover   :  FSM activa");
    eprintln!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // ── Serve com auto-restart em caso de erro ────────────────────────────────
    let mut restart_count: u32 = 0;
    loop {
        let listener = match tokio::net::TcpListener::bind(&addr).await {
            Ok(l) => {
                restart_count = 0;
                l
            }
            Err(e) => {
                restart_count += 1;
                eprintln!("[{}] ERRO bind {}: {} (restart #{})", now(), addr, e, restart_count);
                if restart_count >= 10 {
                    eprintln!("[{}] CRÍTICO: falhas consecutivas demais — a terminar", now());
                    std::process::exit(1);
                }
                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                continue;
            }
        };

        eprintln!("[{}] A escutar em http://{}", now(), addr);

        if let Err(e) = axum::serve(
            listener,
            app.clone().into_make_service_with_connect_info::<SocketAddr>(),
        )
        .await
        {
            eprintln!("[{}] Servidor parou: {} — reiniciar em 2s", now(), e);
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    }
}
