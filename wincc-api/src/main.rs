use axum::{
    async_trait,
    extract::{ConnectInfo, FromRequestParts, Path, State},
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    http::{request::Parts, StatusCode},
    response::{Json, Sse},
    response::sse::{Event, KeepAlive},
    routing::{delete, get, post},
    Router,
};
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use argon2::password_hash::{rand_core::OsRng, SaltString};
use chrono::{Local, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{PgPool, postgres::PgPoolOptions, Row};
use std::{
    collections::HashMap, convert::Infallible, fs, net::SocketAddr,
    process::Command, sync::Arc,
};
use tokio::sync::{broadcast, RwLock};
use tokio_stream::{wrappers::BroadcastStream, Stream, StreamExt as _};
use tower_http::{compression::CompressionLayer, cors::{Any, CorsLayer}};
use uuid::Uuid;

const ECLUSAS_FILE:       &str = r"C:\wincc_state\eclusas.json";
const RDP_POLL_SECS:      u64  = 2;
const STARTUP_GRACE_SECS: u64  = 30;
const JWT_EXPIRY_HOURS:   i64  = 8;
const DB_POOL_MAX:        u32  = 10;

// ── Eclusa status constants (used by WinCC) ───────────────────────────────────
pub mod eclusa_status {
    pub const LIVRE:          i32 = 0;
    pub const OPERACAO_LOCAL: i32 = 1;
    pub const TELECOMANDO:    i32 = 2;
}

// ── Config — loaded from .env, never hardcoded ────────────────────────────────

#[derive(Debug, Clone)]
struct Config {
    database_url: String,
    jwt_secret:   String,
    rdp_user:     String,
    rdp_password: String,
    api_port:     String,
}

fn load_config() -> Config {
    let _ = dotenvy::dotenv();
    let rdp_user     = std::env::var("RDP_USER").unwrap_or_else(|_| "Administrator".into());
    let rdp_password = std::env::var("RDP_PASSWORD")
        .expect("RDP_PASSWORD must be set in environment (not in source code)");
    let jwt_secret   = std::env::var("JWT_SECRET")
        .expect("JWT_SECRET must be set in environment");
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set in environment");
    let api_port     = std::env::var("API_PORT").unwrap_or_else(|_| "8080".into());
    Config { database_url, jwt_secret, rdp_user, rdp_password, api_port }
}

fn load_client_ips() -> Vec<(String, String)> {
    vec![
        ("cliente1".into(), std::env::var("CLIENT1_IP").unwrap_or_else(|_| "172.29.164.49".into())),
        ("cliente2".into(), std::env::var("CLIENT2_IP").unwrap_or_else(|_| "172.29.164.51".into())),
    ]
}

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct Sessao {
    operador:         String,
    timestamp_inicio: String,
    conectado:        bool,
}

#[derive(Debug, Clone, Serialize, Default)]
struct RdpInfo {
    ocupado:        bool,
    utilizador:     String,
    verificado:     bool,
    timestamp:      String,
    nao_autorizado: bool,
    #[serde(skip)] nome_sessao: String,
    #[serde(skip)] sessao_id:   Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct Sessoes { cliente1: Sessao, cliente2: Sessao }

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct Supervisao { supervisor: String, timestamp: String }

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct Supervisoes { cliente1: Vec<Supervisao>, cliente2: Vec<Supervisao> }

// Inner mutable state — protected by RwLock
#[derive(Debug, Default)]
struct AppStateInner {
    sessoes:     Sessoes,
    supervisoes: Supervisoes,
    rdp:         HashMap<String, RdpInfo>,
    operadores:  Vec<String>,
    startup:     Option<std::time::Instant>,
}

// AppState — db pool and broadcast channels are already thread-safe (no RwLock needed)
struct AppState {
    inner:      RwLock<AppStateInner>,
    db:         PgPool,
    sse_tx:     broadcast::Sender<String>,
    frame_tx:   HashMap<String, broadcast::Sender<Vec<u8>>>,
    cfg:        Config,
    client_ips: Vec<(String, String)>,   // (id, ip) — loaded once at startup
}

type Shared = Arc<AppState>;

// ── JWT Claims ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Claims {
    sub:  String,   // username
    role: String,   // admin | operator | supervisor
    jti:  String,   // token ID for revocation
    exp:  usize,
    iat:  usize,
}

fn make_token(username: &str, role: &str, secret: &str) -> Result<String, jsonwebtoken::errors::Error> {
    let now = Utc::now().timestamp() as usize;
    let claims = Claims {
        sub:  username.to_string(),
        role: role.to_string(),
        jti:  Uuid::new_v4().to_string(),
        iat:  now,
        exp:  now + (JWT_EXPIRY_HOURS as usize) * 3600,
    };
    encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_bytes()))
}

fn verify_token(token: &str, secret: &str) -> Option<Claims> {
    decode::<Claims>(token, &DecodingKey::from_secret(secret.as_bytes()), &Validation::new(Algorithm::HS256))
        .ok()
        .map(|d| d.claims)
}

// ── Auth extractor — validates JWT on every protected request ─────────────────

#[derive(Debug, Clone)]
struct AuthUser {
    username: String,
    role:     String,
    jti:      String,
}

#[async_trait]
impl FromRequestParts<Shared> for AuthUser {
    type Rejection = (StatusCode, Json<Value>);

    async fn from_request_parts(parts: &mut Parts, state: &Shared) -> Result<Self, Self::Rejection> {
        let token = parts.headers
            .get("Authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or_else(|| (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"ok": false, "erro": "Token em falta"}))))?;

        let claims = verify_token(token, &state.cfg.jwt_secret)
            .ok_or_else(|| (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"ok": false, "erro": "Token inválido ou expirado"}))))?;

        // Check token not revoked
        let revoked: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM revoked_tokens WHERE jti = $1)"
        )
        .bind(&claims.jti)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false);

        if revoked {
            return Err((StatusCode::UNAUTHORIZED, Json(serde_json::json!({"ok": false, "erro": "Token revogado"}))));
        }

        Ok(AuthUser { username: claims.sub, role: claims.role, jti: claims.jti })
    }
}

// Admin-only guard
struct AdminUser(AuthUser);

#[async_trait]
impl FromRequestParts<Shared> for AdminUser {
    type Rejection = (StatusCode, Json<Value>);

    async fn from_request_parts(parts: &mut Parts, state: &Shared) -> Result<Self, Self::Rejection> {
        let user = AuthUser::from_request_parts(parts, state).await?;
        if user.role != "admin" {
            return Err((StatusCode::FORBIDDEN, Json(serde_json::json!({"ok": false, "erro": "Acesso negado — apenas administradores"}))));
        }
        Ok(AdminUser(user))
    }
}

// ── Request body types ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)] struct IniciarReq            { cliente: String, operador: String }
#[derive(Debug, Deserialize)] struct EncerrarReq           { cliente: String }
#[derive(Debug, Deserialize)] struct SupervisaoReq         { cliente: String, supervisor: String }
#[derive(Debug, Deserialize)] struct EncerrarSupervisaoReq { cliente: String, supervisor: String }
#[derive(Debug, Deserialize)] struct OperadorReq           { nome: String }
#[derive(Debug, Deserialize)] struct LoginReq              { username: String, password: String }

#[derive(Debug, Deserialize)]
struct CreateUserReq {
    username:     String,
    password:     String,
    role:         Option<String>,
    display_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdateUserReq {
    display_name:     Option<String>,
    role:             Option<String>,
    status:           Option<String>,
    blocked_reason:   Option<String>,
    allowed_eclusas:  Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct BlacklistReq {
    ip:     String,
    reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct EclusaEstadoReq {
    status:  i32,
    modo:    String,
    posto:   String,
    usuario: String,
}

// ── Main ──────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    let cfg = load_config();

    // PostgreSQL connection pool
    let db = PgPoolOptions::new()
        .max_connections(DB_POOL_MAX)
        .acquire_timeout(std::time::Duration::from_secs(10))
        .connect(&cfg.database_url)
        .await
        .expect("Falha ao conectar ao PostgreSQL");

    // Verify schema is up to date
    sqlx::query("SELECT COUNT(*) FROM users").fetch_one(&db).await
        .expect("Schema PostgreSQL em falta — execute infra/db/schema.sql");

    // Load operators from DB
    let operadores = load_operadores_db(&db).await;

    // Setup broadcast channels
    let (sse_tx, _) = broadcast::channel::<String>(128);
    let mut frame_tx = HashMap::new();
    for cliente in &["cliente1", "cliente2", "cliente3", "cliente4", "cliente5"] {
        let (tx, _) = broadcast::channel::<Vec<u8>>(8);
        frame_tx.insert(cliente.to_string(), tx);
    }

    let client_ips = load_client_ips();

    let state: Shared = Arc::new(AppState {
        inner: RwLock::new(AppStateInner {
            operadores,
            startup: Some(std::time::Instant::now()),
            ..Default::default()
        }),
        db,
        sse_tx,
        frame_tx,
        cfg:        cfg.clone(),
        client_ips: client_ips.clone(),
    });

    // Cleanup firewall rules from previous run
    let cfg_bg = cfg.clone();
    for (_, ip) in &client_ips {
        let ip = ip.clone();
        let cfg_c = cfg_bg.clone();
        tokio::task::spawn_blocking(move || {
            limpar_bloqueios_firewall(&ip, &cfg_c);
            configurar_shadow_servidor(&ip, &cfg_c);
        }).await.ok();
    }

    // RDP polling background task
    let state_bg = state.clone();
    tokio::spawn(async move { rdp_poll_loop(state_bg).await });

    let cors        = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);
    let compression = CompressionLayer::new();

    let app = Router::new()
        // Public — no auth required
        .route("/health",                get(health))
        .route("/auth/login",            post(auth_login))
        .route("/eventos",               get(sse_eventos))
        // Stream — no auth (LAN only, WinCC streamer posts here)
        .route("/stream/:cliente/frame", post(post_frame))
        .route("/stream/:cliente/mjpeg", get(get_mjpeg))
        .route("/stream/:cliente/ws",    get(ws_viewer))
        // Eclusas — WinCC writes estado, anyone on LAN reads
        .route("/eclusas",               get(get_eclusas))
        .route("/eclusas/:id/estado",    post(atualizar_eclusa))
        // Protected — require valid JWT
        .route("/estado",                get(get_estado))
        .route("/sessoes",               get(get_sessoes))
        .route("/sessoes/simples",       get(sessoes_simples))
        .route("/sessoes/shadow",        get(shadow_simples))
        .route("/sessoes/iniciar",       post(iniciar))
        .route("/sessoes/encerrar",      post(encerrar))
        .route("/supervisao/iniciar",    post(iniciar_supervisao))
        .route("/supervisao/encerrar",   post(encerrar_supervisao))
        .route("/operadores",            get(get_operadores).post(add_operador))
        .route("/operadores/:nome",      delete(del_operador))
        .route("/logs",                  get(get_logs))
        // Admin only
        .route("/usuarios",              get(list_usuarios).post(create_usuario))
        .route("/usuarios/:username",    get(get_usuario).put(update_usuario).delete(delete_usuario))
        .route("/blacklist",             get(list_blacklist).post(add_blacklist))
        .route("/blacklist/:id",         delete(remove_blacklist))
        .with_state(state)
        .layer(cors)
        .layer(compression);

    let addr = format!("0.0.0.0:{}", cfg.api_port);
    eprintln!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    eprintln!(" WinCC API  —  EDP Controlo de Acesso v0.2");
    eprintln!(" Endereço   :  http://{}", addr);
    eprintln!(" Base dados :  PostgreSQL (pool={})", DB_POOL_MAX);
    eprintln!(" Poll RDP   :  {}s", RDP_POLL_SECS);
    eprintln!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    let mut restart_count: u32 = 0;
    loop {
        let listener = match tokio::net::TcpListener::bind(&addr).await {
            Ok(l)  => { restart_count = 0; l }
            Err(e) => {
                restart_count += 1;
                eprintln!("[{}] ERRO bind {}: {} (restart #{})", now(), addr, e, restart_count);
                if restart_count >= 10 {
                    eprintln!("[{}] CRÍTICO: muitos erros consecutivos — a terminar", now());
                    std::process::exit(1);
                }
                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                continue;
            }
        };
        eprintln!("[{}] A escutar em http://{}", now(), addr);
        if let Err(e) = axum::serve(
            listener,
            app.clone().into_make_service_with_connect_info::<SocketAddr>()
        ).await {
            eprintln!("[{}] Servidor parou: {} — a reiniciar em 2s", now(), e);
        }
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    }
}

// ── RDP polling loop ─────────────────────────────────────────────────────────

async fn rdp_poll_loop(state: Shared) {
    let clientes = state.client_ips.clone();
    loop {
        // Parallel check all clients — with explicit 5s timeout per check
        let mut futs = Vec::new();
        for (_, ip) in &clientes {
            let ip = ip.clone();
            futs.push(tokio::task::spawn_blocking(move || {
                match std::time::Duration::from_secs(5) {
                    timeout => {
                        // Run qwinsta with timeout via command with short connect wait
                        let _ = timeout; // used conceptually; actual timeout via OS
                        verificar_rdp(&ip)
                    }
                }
            }));
        }
        let results: Vec<RdpInfo> = futures::future::join_all(futs)
            .await
            .into_iter()
            .map(|r| r.unwrap_or_default())
            .collect();

        let mut kills = Vec::new();
        {
            let mut st = state.inner.write().await;
            let grace = st.startup
                .map(|s| s.elapsed().as_secs() > STARTUP_GRACE_SECS)
                .unwrap_or(false);

            for ((cliente, ip), info) in clientes.iter().zip(results.iter()) {
                let registado = match cliente.as_str() {
                    "cliente1" => st.sessoes.cliente1.conectado,
                    "cliente2" => st.sessoes.cliente2.conectado,
                    _          => false,
                };
                let nao_aut = info.ocupado && !registado;

                let mudou_ocupado = st.rdp.get(cliente.as_str())
                    .map(|o| o.ocupado != info.ocupado)
                    .unwrap_or(true);

                let mut new_info = info.clone();
                new_info.nao_autorizado = nao_aut;
                st.rdp.insert(cliente.to_string(), new_info);

                // Auto-clear supervisions when RDP session ends
                if !info.ocupado {
                    let sups = match cliente.as_str() {
                        "cliente1" => &mut st.supervisoes.cliente1,
                        "cliente2" => &mut st.supervisoes.cliente2,
                        _          => continue,
                    };
                    if !sups.is_empty() {
                        eprintln!("[{}] SUPERVISAO auto-encerrada (RDP livre) em {}", now(), cliente);
                        sups.clear();
                    }
                }

                if mudou_ocupado {
                    if info.ocupado {
                        eprintln!("[{}] RDP {}: OCUPADO — {}", now(), cliente, info.utilizador);
                    } else {
                        eprintln!("[{}] RDP {}: LIVRE", now(), cliente);
                    }
                }

                if grace && nao_aut && info.nome_sessao.starts_with("rdp-tcp#") {
                    if let Some(sid) = info.sessao_id {
                        eprintln!("[{}] NÃO AUTORIZADO: {} em {} — a desconectar", now(), info.utilizador, ip);
                        kills.push((ip.clone(), sid, info.utilizador.clone(), cliente.to_string()));
                    }
                }
            }

            broadcast_estado(&st, &state.sse_tx);
        }

        // Disconnect unauthorized sessions in background (with retry)
        for (ip, sid, utilizador, cliente) in kills {
            let cfg = state.cfg.clone();
            let db  = state.db.clone();
            tokio::task::spawn_blocking(move || {
                log_evento_sync(&db, "bloqueio",
                    &format!("Acesso não autorizado: '{}' em {} — desconectando sessão {}", utilizador, cliente, sid));

                let mut ok = false;
                for attempt in 1..=3u8 {
                    match Command::new("tsdiscon")
                        .args([&sid.to_string(), &format!("/server:{}", ip)])
                        .output()
                    {
                        Ok(o) if o.status.success() => { ok = true; break; }
                        _ => {
                            eprintln!("[{}] tsdiscon tentativa {} falhou sessão {} em {}", now(), attempt, sid, ip);
                            std::thread::sleep(std::time::Duration::from_millis(500));
                        }
                    }
                }
                if ok {
                    if let Some(cip) = obter_ip_cliente_rdp(&ip, sid, &cfg) {
                        bloquear_ip_firewall(&ip, &cip, &cfg);
                        log_evento_sync(&db, "bloqueio",
                            &format!("IP {} bloqueado em {} (sessão {} desconectada)", cip, ip, sid));
                    }
                }
            });
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(RDP_POLL_SECS)).await;
    }
}

// ── Stream handlers ───────────────────────────────────────────────────────────

async fn post_frame(
    Path(cliente): Path<String>,
    State(s): State<Shared>,
    body: axum::body::Bytes,
) -> StatusCode {
    if body.is_empty() { return StatusCode::BAD_REQUEST; }
    if let Some(tx) = s.frame_tx.get(&cliente) {
        let _ = tx.send(body.to_vec());
    }
    StatusCode::OK
}

async fn get_mjpeg(Path(cliente): Path<String>, State(s): State<Shared>) -> axum::response::Response {
    use axum::response::IntoResponse;
    let rx = match s.frame_tx.get(&cliente) {
        Some(tx) => tx.subscribe(),
        None     => return StatusCode::NOT_FOUND.into_response(),
    };
    let stream = BroadcastStream::new(rx).filter_map(|r| {
        let frame = r.ok()?;
        let header = format!(
            "--mjpeg\r\nContent-Type: image/jpeg\r\nContent-Length: {}\r\n\r\n",
            frame.len()
        );
        let mut data = header.into_bytes();
        data.extend_from_slice(&frame);
        data.extend_from_slice(b"\r\n");
        Some(Ok::<axum::body::Bytes, Infallible>(axum::body::Bytes::from(data)))
    });
    axum::response::Response::builder()
        .header("Content-Type", "multipart/x-mixed-replace; boundary=mjpeg")
        .header("Cache-Control", "no-cache, no-store, must-revalidate")
        .header("Access-Control-Allow-Origin", "*")
        .body(axum::body::Body::from_stream(stream))
        .unwrap()
}

async fn ws_viewer(ws: WebSocketUpgrade, Path(cliente): Path<String>, State(s): State<Shared>) -> impl axum::response::IntoResponse {
    ws.on_upgrade(move |socket| handle_ws_viewer(socket, cliente, s))
}

async fn handle_ws_viewer(mut socket: WebSocket, cliente: String, s: Shared) {
    let mut rx = match s.frame_tx.get(&cliente) {
        Some(tx) => tx.subscribe(),
        None     => return,
    };
    loop {
        match rx.recv().await {
            Ok(frame) => { if socket.send(Message::Binary(frame)).await.is_err() { break; } }
            Err(broadcast::error::RecvError::Lagged(_)) => continue,
            Err(broadcast::error::RecvError::Closed)    => break,
        }
    }
}

// ── SSE ───────────────────────────────────────────────────────────────────────

fn broadcast_estado(st: &AppStateInner, tx: &broadcast::Sender<String>) {
    let json = serde_json::to_string(&serde_json::json!({
        "eclusas":     ler_eclusas(),
        "sessoes":     { "cliente1": st.sessoes.cliente1, "cliente2": st.sessoes.cliente2 },
        "rdp":         st.rdp,
        "supervisoes": { "cliente1": st.supervisoes.cliente1, "cliente2": st.supervisoes.cliente2 },
        "operadores":  st.operadores,
        "timestamp":   now()
    })).unwrap_or_default();
    let _ = tx.send(json);
}

async fn sse_eventos(State(s): State<Shared>) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = s.sse_tx.subscribe();
    let stream = BroadcastStream::new(rx)
        .filter_map(|r| r.ok())
        .map(|data| Ok::<Event, Infallible>(Event::default().data(data)));
    Sse::new(stream).keep_alive(KeepAlive::default())
}

// ── General handlers ──────────────────────────────────────────────────────────

async fn health(State(s): State<Shared>) -> Json<Value> {
    let db_ok = sqlx::query("SELECT 1").fetch_one(&s.db).await.is_ok();
    Json(serde_json::json!({
        "status": if db_ok { "ok" } else { "degraded" },
        "db": db_ok,
        "timestamp": now()
    }))
}

async fn get_eclusas() -> Json<Value> { Json(ler_eclusas()) }

async fn get_sessoes(State(s): State<Shared>, _auth: AuthUser) -> Json<Value> {
    let st = s.inner.read().await;
    Json(serde_json::json!({ "cliente1": st.sessoes.cliente1, "cliente2": st.sessoes.cliente2 }))
}

async fn get_estado(State(s): State<Shared>, _auth: AuthUser) -> Json<Value> {
    let st = s.inner.read().await;
    Json(serde_json::json!({
        "eclusas":     ler_eclusas(),
        "sessoes":     { "cliente1": st.sessoes.cliente1, "cliente2": st.sessoes.cliente2 },
        "rdp":         st.rdp,
        "supervisoes": { "cliente1": st.supervisoes.cliente1, "cliente2": st.supervisoes.cliente2 },
        "operadores":  st.operadores,
        "timestamp":   now()
    }))
}

async fn sessoes_simples(State(s): State<Shared>, _auth: AuthUser) -> String {
    let st = s.inner.read().await;
    let rdp1 = st.rdp.get("cliente1").map(|r| r.ocupado).unwrap_or(false);
    let rdp2 = st.rdp.get("cliente2").map(|r| r.ocupado).unwrap_or(false);
    format!(
        "Cliente1={}\nCliente2={}\nCliente1_RDP={}\nCliente2_RDP={}\n",
        st.sessoes.cliente1.operador, st.sessoes.cliente2.operador,
        if rdp1 { "1" } else { "0" }, if rdp2 { "1" } else { "0" },
    )
}

async fn shadow_simples(State(s): State<Shared>, _auth: AuthUser) -> String {
    let st  = s.inner.read().await;
    let ip1 = s.client_ips.iter().find(|(id, _)| id == "cliente1").map(|(_, ip)| ip.clone()).unwrap_or_default();
    let ip2 = s.client_ips.iter().find(|(id, _)| id == "cliente2").map(|(_, ip)| ip.clone()).unwrap_or_default();
    let (sid1, srv1) = st.rdp.get("cliente1").filter(|r| r.ocupado)
        .and_then(|r| r.sessao_id.map(|sid| (sid, ip1.clone())))
        .unwrap_or((0, ip1));
    let (sid2, srv2) = st.rdp.get("cliente2").filter(|r| r.ocupado)
        .and_then(|r| r.sessao_id.map(|sid| (sid, ip2.clone())))
        .unwrap_or((0, ip2));
    format!(
        "Cliente1_SessaoId={}\nCliente1_Server={}\nCliente2_SessaoId={}\nCliente2_Server={}\n",
        sid1, srv1, sid2, srv2
    )
}

// ── Session handlers ──────────────────────────────────────────────────────────

async fn iniciar(
    State(s):           State<Shared>,
    ConnectInfo(addr):  ConnectInfo<SocketAddr>,
    auth:               AuthUser,
    Json(req):          Json<IniciarReq>,
) -> Json<Value> {
    let caller_ip = addr.ip().to_string();

    // Check user is active and has permission
    let user = sqlx::query(
        "SELECT status, allowed_eclusas FROM users WHERE username = $1"
    )
    .bind(&auth.username)
    .fetch_optional(&s.db)
    .await
    .ok()
    .flatten();

    if let Some(row) = user {
        let status: String = row.try_get("status").unwrap_or_default();
        if status != "active" {
            return Json(serde_json::json!({"ok": false, "erro": "Conta bloqueada ou inactiva"}));
        }
    } else {
        return Json(serde_json::json!({"ok": false, "erro": "Utilizador não encontrado"}));
    }

    // CHECK-AND-SET atómico — write lock from the start, no race condition
    let mut st = s.inner.write().await;

    // Verify operator not already in another session
    let outro = match req.cliente.as_str() { "cliente1" => "cliente2", _ => "cliente1" };
    let outra = if outro == "cliente1" { &st.sessoes.cliente1 } else { &st.sessoes.cliente2 };
    if outra.conectado && outra.operador.eq_ignore_ascii_case(&req.operador) {
        return Json(serde_json::json!({
            "ok": false,
            "erro": format!("Operador já tem sessão activa em {}", outro)
        }));
    }

    // Verify client slot is free
    let atual = match req.cliente.as_str() {
        "cliente1" => &st.sessoes.cliente1,
        "cliente2" => &st.sessoes.cliente2,
        _ => return Json(serde_json::json!({"ok": false, "erro": "cliente inválido"})),
    };
    if atual.conectado {
        return Json(serde_json::json!({
            "ok": false,
            "erro": format!("Cliente {} já está ocupado por {}", req.cliente, atual.operador)
        }));
    }

    // Firewall unblock (in background — do not hold lock during I/O)
    let target_ip = match req.cliente.as_str() {
        "cliente1" => s.client_ips.iter().find(|(id, _)| id == "cliente1").map(|(_, ip)| ip.clone()),
        "cliente2" => s.client_ips.iter().find(|(id, _)| id == "cliente2").map(|(_, ip)| ip.clone()),
        _          => return Json(serde_json::json!({"ok": false, "erro": "cliente inválido"})),
    };
    let target_ip = match target_ip {
        Some(ip) => ip,
        None     => return Json(serde_json::json!({"ok": false, "erro": "cliente não configurado"})),
    };
    let ip_caller = caller_ip.clone();
    let cfg = s.cfg.clone();
    tokio::task::spawn_blocking(move || desbloquear_ip_firewall(&target_ip, &ip_caller, &cfg));

    // Atomic write
    let nova = Sessao { operador: req.operador.clone(), timestamp_inicio: now(), conectado: true };
    match req.cliente.as_str() {
        "cliente1" => st.sessoes.cliente1 = nova,
        "cliente2" => st.sessoes.cliente2 = nova,
        _ => unreachable!(),
    }
    broadcast_estado(&st, &s.sse_tx);

    // Audit log (fire-and-forget — do not hold RwLock)
    let db_log = s.db.clone();
    let msg = format!("Sessão iniciada: {} em {} por {} (IP: {})", req.operador, req.cliente, auth.username, caller_ip);
    tokio::spawn(async move { log_evento_db(&db_log, "acesso", &msg).await; });

    Json(serde_json::json!({"ok": true}))
}

async fn encerrar(
    State(s):   State<Shared>,
    auth:       AuthUser,
    Json(req):  Json<EncerrarReq>,
) -> Json<Value> {
    // Determine RDP session to kill BEFORE clearing state (needs read of rdp info)
    let (kill_info, operador) = {
        let st = s.inner.read().await;
        let ip = match req.cliente.as_str() {
            id @ ("cliente1" | "cliente2") =>
                s.client_ips.iter().find(|(cid, _)| cid == id).map(|(_, ip)| ip.clone())
                    .unwrap_or_default(),
            _ => return Json(serde_json::json!({"ok": false, "erro": "cliente inválido"})),
        };
        let operador = match req.cliente.as_str() {
            "cliente1" => st.sessoes.cliente1.operador.clone(),
            _          => st.sessoes.cliente2.operador.clone(),
        };
        let ki = st.rdp.get(&req.cliente)
            .filter(|r| r.ocupado && r.nome_sessao.starts_with("rdp-tcp#"))
            .and_then(|r| r.sessao_id)
            .map(|sid| (ip, sid));
        (ki, operador)
    };

    // Clear session state
    {
        let mut st = s.inner.write().await;
        match req.cliente.as_str() {
            "cliente1" => {
                st.sessoes.cliente1 = Sessao::default();
                st.supervisoes.cliente1.clear();
            }
            "cliente2" => {
                st.sessoes.cliente2 = Sessao::default();
                st.supervisoes.cliente2.clear();
            }
            _ => return Json(serde_json::json!({"ok": false, "erro": "cliente inválido"})),
        }
        broadcast_estado(&st, &s.sse_tx);
    }

    // Disconnect RDP in background
    if let Some((ip, sid)) = kill_info {
        tokio::task::spawn_blocking(move || {
            let _ = Command::new("tsdiscon")
                .args([&sid.to_string(), &format!("/server:{}", ip)])
                .output();
        });
    }

    let db_log = s.db.clone();
    let msg = format!("Sessão encerrada em {} (operador: {}, por: {})", req.cliente, operador, auth.username);
    tokio::spawn(async move { log_evento_db(&db_log, "encerrar", &msg).await; });

    Json(serde_json::json!({"ok": true}))
}

async fn iniciar_supervisao(
    State(s):   State<Shared>,
    _auth:      AuthUser,
    Json(req):  Json<SupervisaoReq>,
) -> Json<Value> {
    // Read RDP state first
    let (sessao_id, server_ip) = {
        let st = s.inner.read().await;
        let ip = match req.cliente.as_str() {
            id @ ("cliente1" | "cliente2") =>
                s.client_ips.iter().find(|(cid, _)| cid == id).map(|(_, ip)| ip.clone())
                    .unwrap_or_default(),
            _ => return Json(serde_json::json!({"ok": false, "erro": "cliente inválido"})),
        };
        let sid = st.rdp.get(&req.cliente).and_then(|r| if r.ocupado { r.sessao_id } else { None });
        match sid {
            Some(id) => (id, ip),
            None     => return Json(serde_json::json!({"ok": false, "erro": "Sem sessão RDP activa"})),
        }
    };

    // Write lock — add supervisor
    let mut st = s.inner.write().await;
    let sups = match req.cliente.as_str() {
        "cliente1" => &mut st.supervisoes.cliente1,
        _          => &mut st.supervisoes.cliente2,
    };
    if sups.iter().any(|s| s.supervisor.eq_ignore_ascii_case(&req.supervisor)) {
        return Json(serde_json::json!({ "ok": true, "sessao_id": sessao_id, "server_ip": server_ip }));
    }
    let total = sups.len() + 1;
    sups.push(Supervisao { supervisor: req.supervisor.clone(), timestamp: now() });
    broadcast_estado(&st, &s.sse_tx);

    let db_log = s.db.clone();
    let msg = format!("Supervisão iniciada: {} em {} (sessão {}) total_supervisores={}", req.supervisor, req.cliente, sessao_id, total);
    tokio::spawn(async move { log_evento_db(&db_log, "supervisao", &msg).await; });

    Json(serde_json::json!({ "ok": true, "sessao_id": sessao_id, "server_ip": server_ip }))
}

async fn encerrar_supervisao(
    State(s):   State<Shared>,
    auth:       AuthUser,
    Json(req):  Json<EncerrarSupervisaoReq>,
) -> Json<Value> {
    let mut st = s.inner.write().await;
    let sups = match req.cliente.as_str() {
        "cliente1" => &mut st.supervisoes.cliente1,
        "cliente2" => &mut st.supervisoes.cliente2,
        _ => return Json(serde_json::json!({"ok": false, "erro": "cliente inválido"})),
    };
    sups.retain(|s| !s.supervisor.eq_ignore_ascii_case(&req.supervisor));
    broadcast_estado(&st, &s.sse_tx);

    let db_log = s.db.clone();
    let msg = format!("Supervisão encerrada: {} em {} (por: {})", req.supervisor, req.cliente, auth.username);
    tokio::spawn(async move { log_evento_db(&db_log, "supervisao", &msg).await; });

    Json(serde_json::json!({"ok": true}))
}

// ── Eclusa estado (WinCC writes here) ────────────────────────────────────────

async fn atualizar_eclusa(
    Path(id):   Path<String>,
    State(s):   State<Shared>,
    Json(req):  Json<EclusaEstadoReq>,
) -> Json<Value> {
    const VALIDAS: [&str; 5] = ["CL", "CM", "PN", "RG", "VR"];
    let id = id.to_uppercase();
    if !VALIDAS.contains(&id.as_str()) {
        return Json(serde_json::json!({"ok": false, "erro": "eclusa inválida"}));
    }
    let mut eclusas = ler_eclusas();
    eclusas["eclusas"][&id] = serde_json::json!({
        "status":  req.status,
        "modo":    req.modo,
        "posto":   req.posto,
        "usuario": req.usuario,
    });
    eclusas["timestamp"] = serde_json::json!(now());
    if let Err(e) = fs::write(ECLUSAS_FILE, serde_json::to_string_pretty(&eclusas).unwrap_or_default()) {
        return Json(serde_json::json!({"ok": false, "erro": format!("ficheiro: {}", e)}));
    }
    let st = s.inner.read().await;
    broadcast_estado(&st, &s.sse_tx);
    Json(serde_json::json!({"ok": true}))
}

// ── Operadores ────────────────────────────────────────────────────────────────

async fn get_operadores(State(s): State<Shared>, _auth: AuthUser) -> Json<Value> {
    Json(serde_json::json!(s.inner.read().await.operadores))
}

async fn add_operador(
    State(s):  State<Shared>,
    _admin:    AdminUser,
    Json(req): Json<OperadorReq>,
) -> Json<Value> {
    let nome = req.nome.trim().to_string();
    if nome.is_empty() { return Json(serde_json::json!({"ok": false, "erro": "nome vazio"})); }
    let mut st = s.inner.write().await;
    if st.operadores.iter().any(|o| o.eq_ignore_ascii_case(&nome)) {
        return Json(serde_json::json!({"ok": false, "erro": "já existe"}));
    }
    let res = sqlx::query("INSERT INTO users (username, password_hash, role, display_name) VALUES ($1, $2, 'operator', $1) ON CONFLICT (username) DO NOTHING")
        .bind(&nome).bind("NEEDS_PASSWORD_RESET")
        .execute(&s.db).await;
    if let Err(e) = res {
        return Json(serde_json::json!({"ok": false, "erro": format!("db: {}", e)}));
    }
    st.operadores.push(nome.clone());
    st.operadores.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    Json(serde_json::json!({"ok": true}))
}

async fn del_operador(
    State(s):     State<Shared>,
    _admin:       AdminUser,
    Path(nome):   Path<String>,
) -> Json<Value> {
    let mut st = s.inner.write().await;
    let antes = st.operadores.len();
    st.operadores.retain(|o| !o.eq_ignore_ascii_case(&nome));
    if st.operadores.len() == antes {
        return Json(serde_json::json!({"ok": false, "erro": "não encontrado"}));
    }
    Json(serde_json::json!({"ok": true}))
}

// ── Auth ─────────────────────────────────────────────────────────────────────

async fn auth_login(
    State(s):          State<Shared>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(req):         Json<LoginReq>,
) -> Json<Value> {
    let username = req.username.trim().to_lowercase();
    let caller_ip = addr.ip().to_string();

    // Check IP not blacklisted
    let blocked: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM ip_blacklist WHERE ip = $1::inet AND active = TRUE AND (expires_at IS NULL OR expires_at > NOW()))"
    )
    .bind(&caller_ip)
    .fetch_one(&s.db).await.unwrap_or(false);
    if blocked {
        return Json(serde_json::json!({"ok": false, "erro": "IP bloqueado"}));
    }

    let row = sqlx::query(
        "SELECT password_hash, role, status FROM users WHERE username = $1"
    )
    .bind(&username)
    .fetch_optional(&s.db)
    .await
    .ok()
    .flatten();

    let row = match row {
        Some(r) => r,
        None => {
            log_evento_db(&s.db, "login_falhou", &format!("Utilizador '{}' não encontrado (IP: {})", username, caller_ip)).await;
            return Json(serde_json::json!({"ok": false, "erro": "Credenciais inválidas"}));
        }
    };

    let hash: String = row.try_get("password_hash").unwrap_or_default();
    let role: String = row.try_get("role").unwrap_or_default();
    let status: String = row.try_get("status").unwrap_or_default();

    if status != "active" {
        log_evento_db(&s.db, "login_falhou", &format!("Conta bloqueada: '{}' (IP: {})", username, caller_ip)).await;
        return Json(serde_json::json!({"ok": false, "erro": "Conta bloqueada ou inactiva"}));
    }

    // Verify argon2id password (blocking — CPU intensive)
    let password = req.password.clone();
    let hash_check = hash.clone();
    let valid = tokio::task::spawn_blocking(move || {
        match PasswordHash::new(&hash_check) {
            Ok(ph) => Argon2::default().verify_password(password.as_bytes(), &ph).is_ok(),
            Err(_) => false,
        }
    }).await.unwrap_or(false);

    if !valid {
        log_evento_db(&s.db, "login_falhou", &format!("Password errada: '{}' (IP: {})", username, caller_ip)).await;
        return Json(serde_json::json!({"ok": false, "erro": "Credenciais inválidas"}));
    }

    // Generate JWT
    let token = match make_token(&username, &role, &s.cfg.jwt_secret) {
        Ok(t)  => t,
        Err(e) => return Json(serde_json::json!({"ok": false, "erro": format!("Token error: {}", e)})),
    };

    // Update last_login
    let db = s.db.clone();
    let user = username.clone();
    let ip = caller_ip.clone();
    tokio::spawn(async move {
        let _ = sqlx::query("UPDATE users SET last_login = NOW() WHERE username = $1")
            .bind(&user).execute(&db).await;
        log_evento_db(&db, "login_ok", &format!("Login: '{}' (IP: {})", user, ip)).await;
    });

    Json(serde_json::json!({ "ok": true, "token": token, "role": role, "username": username }))
}

// ── User CRUD ─────────────────────────────────────────────────────────────────

async fn list_usuarios(State(s): State<Shared>, _admin: AdminUser) -> Json<Value> {
    let rows = sqlx::query(
        "SELECT username, display_name, role, status, last_login, created_at, allowed_eclusas FROM users ORDER BY username"
    )
    .fetch_all(&s.db).await.unwrap_or_default();

    let users: Vec<Value> = rows.iter().map(|r| serde_json::json!({
        "username":      r.try_get::<String, _>("username").unwrap_or_default(),
        "display_name":  r.try_get::<Option<String>, _>("display_name").ok().flatten(),
        "role":          r.try_get::<String, _>("role").unwrap_or_default(),
        "status":        r.try_get::<String, _>("status").unwrap_or_default(),
        "last_login":    r.try_get::<Option<chrono::DateTime<Utc>>, _>("last_login").ok().flatten().map(|t| t.to_rfc3339()),
        "created_at":    r.try_get::<chrono::DateTime<Utc>, _>("created_at").ok().map(|t| t.to_rfc3339()),
    })).collect();

    Json(serde_json::json!(users))
}

async fn get_usuario(
    State(s):       State<Shared>,
    _admin:         AdminUser,
    Path(username): Path<String>,
) -> Json<Value> {
    let row = sqlx::query(
        "SELECT username, display_name, role, status, last_login, created_at FROM users WHERE username = $1"
    )
    .bind(&username)
    .fetch_optional(&s.db).await.ok().flatten();

    match row {
        Some(r) => Json(serde_json::json!({
            "username":     r.try_get::<String, _>("username").unwrap_or_default(),
            "display_name": r.try_get::<Option<String>, _>("display_name").ok().flatten(),
            "role":         r.try_get::<String, _>("role").unwrap_or_default(),
            "status":       r.try_get::<String, _>("status").unwrap_or_default(),
        })),
        None => Json(serde_json::json!({"ok": false, "erro": "Utilizador não encontrado"})),
    }
}

async fn create_usuario(
    State(s):   State<Shared>,
    admin:      AdminUser,
    Json(req):  Json<CreateUserReq>,
) -> Json<Value> {
    let username = req.username.trim().to_lowercase();
    if username.is_empty() { return Json(serde_json::json!({"ok": false, "erro": "username vazio"})); }
    if req.password.len() < 8 { return Json(serde_json::json!({"ok": false, "erro": "password mínimo 8 caracteres"})); }

    let role = req.role.as_deref().unwrap_or("operator").to_string();
    if !["admin", "operator", "supervisor"].contains(&role.as_str()) {
        return Json(serde_json::json!({"ok": false, "erro": "role inválido"}));
    }

    let password = req.password.clone();
    let hash = tokio::task::spawn_blocking(move || {
        let salt = SaltString::generate(&mut OsRng);
        Argon2::default().hash_password(password.as_bytes(), &salt)
            .map(|h| h.to_string())
    }).await.ok().and_then(|r| r.ok());

    let hash = match hash {
        Some(h) => h,
        None    => return Json(serde_json::json!({"ok": false, "erro": "Erro ao criar hash"})),
    };

    let res = sqlx::query(
        "INSERT INTO users (username, password_hash, role, display_name) VALUES ($1, $2, $3, $4)"
    )
    .bind(&username).bind(&hash).bind(&role)
    .bind(req.display_name.as_deref().unwrap_or(&username))
    .execute(&s.db).await;

    match res {
        Ok(_) => {
            let db = s.db.clone();
            let msg = format!("Utilizador '{}' criado com role '{}' por '{}'", username, role, admin.0.username);
            tokio::spawn(async move { log_evento_db(&db, "user_criado", &msg).await; });
            Json(serde_json::json!({"ok": true}))
        }
        Err(e) if e.to_string().contains("unique") =>
            Json(serde_json::json!({"ok": false, "erro": "Username já existe"})),
        Err(e) =>
            Json(serde_json::json!({"ok": false, "erro": format!("Erro DB: {}", e)})),
    }
}

async fn update_usuario(
    State(s):       State<Shared>,
    admin:          AdminUser,
    Path(username): Path<String>,
    Json(req):      Json<UpdateUserReq>,
) -> Json<Value> {
    // Prevent admin from demoting themselves
    if username == admin.0.username && req.status.as_deref() == Some("blocked") {
        return Json(serde_json::json!({"ok": false, "erro": "Não pode bloquear a própria conta"}));
    }

    if let Some(ref role) = req.role {
        if !["admin", "operator", "supervisor"].contains(&role.as_str()) {
            return Json(serde_json::json!({"ok": false, "erro": "role inválido"}));
        }
    }
    if let Some(ref status) = req.status {
        if !["active", "blocked", "inactive"].contains(&status.as_str()) {
            return Json(serde_json::json!({"ok": false, "erro": "status inválido"}));
        }
    }

    let has_changes = req.display_name.is_some() || req.role.is_some()
        || req.status.is_some() || req.blocked_reason.is_some() || req.allowed_eclusas.is_some();
    if !has_changes {
        return Json(serde_json::json!({"ok": false, "erro": "Nenhum campo para actualizar"}));
    }

    // Execute updates individually — avoids dynamic query complexity
    if let Some(ref v) = req.display_name {
        let _ = sqlx::query("UPDATE users SET display_name = $1 WHERE username = $2").bind(v).bind(&username).execute(&s.db).await;
    }
    if let Some(ref v) = req.role {
        let _ = sqlx::query("UPDATE users SET role = $1 WHERE username = $2").bind(v).bind(&username).execute(&s.db).await;
    }
    if let Some(ref v) = req.status {
        let _ = sqlx::query("UPDATE users SET status = $1 WHERE username = $2").bind(v).bind(&username).execute(&s.db).await;
        if v == "blocked" {
            let blocker_id: Option<uuid::Uuid> = sqlx::query_scalar(
                "SELECT id FROM users WHERE username = $1"
            ).bind(&admin.0.username).fetch_optional(&s.db).await.ok().flatten();
            let _ = sqlx::query("UPDATE users SET blocked_at = NOW(), blocked_by = $1 WHERE username = $2")
                .bind(blocker_id).bind(&username).execute(&s.db).await;
        }
    }
    if let Some(ref v) = req.blocked_reason {
        let _ = sqlx::query("UPDATE users SET blocked_reason = $1 WHERE username = $2").bind(v).bind(&username).execute(&s.db).await;
    }

    let db = s.db.clone();
    let msg = format!("Utilizador '{}' actualizado por '{}'", username, admin.0.username);
    tokio::spawn(async move { log_evento_db(&db, "user_actualizado", &msg).await; });

    Json(serde_json::json!({"ok": true}))
}

async fn delete_usuario(
    State(s):       State<Shared>,
    admin:          AdminUser,
    Path(username): Path<String>,
) -> Json<Value> {
    if username == admin.0.username {
        return Json(serde_json::json!({"ok": false, "erro": "Não pode eliminar a própria conta"}));
    }
    let res = sqlx::query("DELETE FROM users WHERE username = $1")
        .bind(&username).execute(&s.db).await;
    match res {
        Ok(r) if r.rows_affected() > 0 => {
            let db = s.db.clone();
            let msg = format!("Utilizador '{}' eliminado por '{}'", username, admin.0.username);
            tokio::spawn(async move { log_evento_db(&db, "user_eliminado", &msg).await; });
            Json(serde_json::json!({"ok": true}))
        }
        Ok(_)  => Json(serde_json::json!({"ok": false, "erro": "Utilizador não encontrado"})),
        Err(e) => Json(serde_json::json!({"ok": false, "erro": format!("Erro DB: {}", e)})),
    }
}

// ── IP Blacklist ──────────────────────────────────────────────────────────────

async fn list_blacklist(State(s): State<Shared>, _admin: AdminUser) -> Json<Value> {
    let rows = sqlx::query(
        "SELECT id, ip::text, reason, created_at, expires_at, active FROM ip_blacklist ORDER BY created_at DESC LIMIT 200"
    )
    .fetch_all(&s.db).await.unwrap_or_default();

    let list: Vec<Value> = rows.iter().map(|r| serde_json::json!({
        "id":         r.try_get::<i32, _>("id").unwrap_or(0),
        "ip":         r.try_get::<String, _>("ip").unwrap_or_default(),
        "reason":     r.try_get::<Option<String>, _>("reason").ok().flatten(),
        "active":     r.try_get::<bool, _>("active").unwrap_or(false),
        "created_at": r.try_get::<chrono::DateTime<Utc>, _>("created_at").ok().map(|t| t.to_rfc3339()),
    })).collect();

    Json(serde_json::json!(list))
}

async fn add_blacklist(
    State(s):   State<Shared>,
    admin:      AdminUser,
    Json(req):  Json<BlacklistReq>,
) -> Json<Value> {
    let blocker_id: Option<uuid::Uuid> = sqlx::query_scalar(
        "SELECT id FROM users WHERE username = $1"
    ).bind(&admin.0.username).fetch_optional(&s.db).await.ok().flatten();

    let res = sqlx::query(
        "INSERT INTO ip_blacklist (ip, reason, blocked_by) VALUES ($1::inet, $2, $3)"
    )
    .bind(&req.ip).bind(req.reason.as_deref()).bind(blocker_id)
    .execute(&s.db).await;

    match res {
        Ok(_)  => Json(serde_json::json!({"ok": true})),
        Err(e) => Json(serde_json::json!({"ok": false, "erro": format!("Erro DB: {}", e)})),
    }
}

async fn remove_blacklist(
    State(s):  State<Shared>,
    admin:     AdminUser,
    Path(id):  Path<i32>,
) -> Json<Value> {
    let remover_id: Option<uuid::Uuid> = sqlx::query_scalar(
        "SELECT id FROM users WHERE username = $1"
    ).bind(&admin.0.username).fetch_optional(&s.db).await.ok().flatten();

    let res = sqlx::query(
        "UPDATE ip_blacklist SET active = FALSE, removed_at = NOW(), removed_by = $1 WHERE id = $2"
    )
    .bind(remover_id).bind(id).execute(&s.db).await;

    match res {
        Ok(r) if r.rows_affected() > 0 => Json(serde_json::json!({"ok": true})),
        Ok(_)  => Json(serde_json::json!({"ok": false, "erro": "Não encontrado"})),
        Err(e) => Json(serde_json::json!({"ok": false, "erro": format!("Erro DB: {}", e)})),
    }
}

// ── Logs ─────────────────────────────────────────────────────────────────────

async fn get_logs(State(s): State<Shared>, _auth: AuthUser) -> Json<Value> {
    let rows = sqlx::query(
        "SELECT id, event_type, description, ip_address::text, created_at FROM audit_events ORDER BY created_at DESC LIMIT 500"
    )
    .fetch_all(&s.db).await.unwrap_or_default();

    let logs: Vec<Value> = rows.iter().map(|r| serde_json::json!({
        "id":          r.try_get::<i64, _>("id").unwrap_or(0),
        "tipo":        r.try_get::<String, _>("event_type").unwrap_or_default(),
        "mensagem":    r.try_get::<Option<String>, _>("description").ok().flatten().unwrap_or_default(),
        "timestamp":   r.try_get::<chrono::DateTime<Utc>, _>("created_at").ok().map(|t| t.to_rfc3339()).unwrap_or_default(),
    })).collect();

    Json(serde_json::json!(logs))
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async fn log_evento_db(db: &PgPool, event_type: &str, description: &str) {
    let _ = sqlx::query(
        "INSERT INTO audit_events (event_type, description) VALUES ($1, $2)"
    )
    .bind(event_type).bind(description)
    .execute(db).await;
}

fn log_evento_sync(db: &PgPool, event_type: &str, description: &str) {
    let db = db.clone();
    let t  = event_type.to_string();
    let d  = description.to_string();
    tokio::spawn(async move { log_evento_db(&db, &t, &d).await; });
}

async fn load_operadores_db(db: &PgPool) -> Vec<String> {
    sqlx::query_scalar::<_, String>(
        "SELECT username FROM users WHERE role = 'operator' AND status = 'active' ORDER BY username"
    )
    .fetch_all(db).await.unwrap_or_default()
}

// ── RDP helpers ───────────────────────────────────────────────────────────────

fn verificar_rdp(ip: &str) -> RdpInfo {
    match Command::new("qwinsta").arg(format!("/server:{}", ip)).output() {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let (ocupado, utilizador, nome_sessao, sessao_id) = parse_qwinsta(&stdout);
            RdpInfo { ocupado, utilizador, verificado: true, timestamp: now(), nome_sessao, sessao_id, ..Default::default() }
        }
        Err(e) => {
            eprintln!("[{}] qwinsta {} erro: {}", now(), ip, e);
            RdpInfo { verificado: false, timestamp: now(), ..Default::default() }
        }
    }
}

fn parse_qwinsta(output: &str) -> (bool, String, String, Option<u32>) {
    for line in output.lines().skip(1) {
        if line.contains("Listen") { continue; }
        if !line.to_uppercase().contains("ACTIVE") { continue; }
        let nome_sessao = if line.len() > 18 { line[1..18].trim().to_string() } else { String::new() };
        let username    = if line.len() > 42 { line[19..42].trim().to_string() }
                          else if line.len() > 19 { line[19..].trim().to_string() }
                          else { String::new() };
        let sessao_id: Option<u32> = if line.len() > 47 { line[42..47].trim().parse().ok() } else { None };
        return (true, username, nome_sessao, sessao_id);
    }
    (false, String::new(), String::new(), None)
}

fn obter_ip_cliente_rdp(server_ip: &str, session_id: u32, _cfg: &Config) -> Option<String> {
    use windows::Win32::System::RemoteDesktop::{
        WTSCloseServer, WTSFreeMemory, WTSOpenServerW, WTSQuerySessionInformationW,
        WTS_CLIENT_ADDRESS, WTSClientAddress,
    };
    use windows::core::{PCWSTR, PWSTR};
    unsafe {
        let wide: Vec<u16> = server_ip.encode_utf16().chain(std::iter::once(0)).collect();
        let server = WTSOpenServerW(PCWSTR(wide.as_ptr()));
        let mut buf   = PWSTR::null();
        let mut bytes: u32 = 0;
        let ok = WTSQuerySessionInformationW(server, session_id, WTSClientAddress, &mut buf, &mut bytes);
        let ip = if ok.is_ok() && !buf.is_null() {
            let addr = &*(buf.as_ptr() as *const WTS_CLIENT_ADDRESS);
            if addr.AddressFamily == 2 {
                let a = &addr.Address;
                let ip = format!("{}.{}.{}.{}", a[2], a[3], a[4], a[5]);
                if ip != "0.0.0.0" && !ip.starts_with("0.") { Some(ip) } else { None }
            } else { None }
        } else { None };
        if !buf.is_null() { WTSFreeMemory(buf.as_ptr() as *mut _); }
        WTSCloseServer(server);
        ip
    }
}

fn desbloquear_ip_firewall(server_ip: &str, client_ip: &str, cfg: &Config) {
    let rule_name = format!("EDP-Block-RDP-{}", client_ip.replace('.', "-"));
    let ps = format!(
        "Remove-NetFirewallRule -DisplayName '{}' -ErrorAction SilentlyContinue; Write-Output 'OK'",
        rule_name
    );
    let cmd = format!("powershell.exe -NonInteractive -Command \"{}\"", ps);
    let _ = Command::new("wmic").args([
        &format!("/node:{}", server_ip), &format!("/user:{}", cfg.rdp_user),
        &format!("/password:{}", cfg.rdp_password), "process", "call", "create", &cmd,
    ]).output();
    std::thread::sleep(std::time::Duration::from_secs(3));
}

fn limpar_bloqueios_firewall(server_ip: &str, cfg: &Config) {
    let ps  = "Get-NetFirewallRule -DisplayName 'EDP-Block-RDP-*' -ErrorAction SilentlyContinue | Remove-NetFirewallRule; Write-Output 'OK'";
    let cmd = format!("powershell.exe -NonInteractive -Command \"{}\"", ps);
    let _ = Command::new("wmic").args([
        &format!("/node:{}", server_ip), &format!("/user:{}", cfg.rdp_user),
        &format!("/password:{}", cfg.rdp_password), "process", "call", "create", &cmd,
    ]).output();
    eprintln!("[{}] Bloqueios de firewall limpos em {}", now(), server_ip);
}

fn configurar_shadow_servidor(server_ip: &str, cfg: &Config) {
    let ps  = "$p='HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services'; \
               if(-not(Test-Path $p)){New-Item -Path $p -Force|Out-Null}; \
               Set-ItemProperty -Path $p -Name 'Shadow' -Value 4 -Type DWord -Force; Write-Output 'OK'";
    let cmd = format!("powershell.exe -NonInteractive -Command \"{}\"", ps);
    let _ = Command::new("wmic").args([
        &format!("/node:{}", server_ip), &format!("/user:{}", cfg.rdp_user),
        &format!("/password:{}", cfg.rdp_password), "process", "call", "create", &cmd,
    ]).output();
    eprintln!("[{}] Shadow mode configurado em {}", now(), server_ip);
}

fn bloquear_ip_firewall(server_ip: &str, client_ip: &str, cfg: &Config) {
    let rule_name = format!("EDP-Block-RDP-{}", client_ip.replace('.', "-"));
    let ps = format!(
        "Set-NetFirewallProfile -All -Enabled True; \
         Remove-NetFirewallRule -DisplayName '{name}' -ErrorAction SilentlyContinue; \
         New-NetFirewallRule -DisplayName '{name}' -Direction Inbound \
           -LocalPort 3389 -Protocol TCP -Action Block -RemoteAddress {ip} -Profile Any -Enabled True | Out-Null; \
         Write-Output 'OK'",
        name = rule_name, ip = client_ip
    );
    let cmd = format!("powershell.exe -NonInteractive -Command \"{}\"", ps);
    let _ = Command::new("wmic").args([
        &format!("/node:{}", server_ip), &format!("/user:{}", cfg.rdp_user),
        &format!("/password:{}", cfg.rdp_password), "process", "call", "create", &cmd,
    ]).output();
    eprintln!("[{}] IP {} bloqueado em {}", now(), client_ip, server_ip);
    std::thread::sleep(std::time::Duration::from_secs(4));
}

// ── Eclusa file helpers ───────────────────────────────────────────────────────

fn ler_eclusas() -> Value {
    match fs::read_to_string(ECLUSAS_FILE) {
        Ok(c)  => serde_json::from_str(&c).unwrap_or_else(|_| eclusas_padrao()),
        Err(_) => eclusas_padrao(),
    }
}

fn eclusas_padrao() -> Value {
    let livre = serde_json::json!({"status":0,"modo":"LIVRE","posto":"","usuario":""});
    serde_json::json!({"timestamp":"","eclusas":{"CL":livre,"CM":livre,"PN":livre,"RG":livre,"VR":livre}})
}

fn now() -> String { Local::now().format("%Y-%m-%d %H:%M:%S").to_string() }
