use axum::{
    extract::{ConnectInfo, Path, State},
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::{Json, Sse},
    response::sse::{Event, KeepAlive},
    routing::{delete, get, post},
    http::StatusCode,
    Router,
};
use std::{convert::Infallible, net::SocketAddr};
use chrono::Local;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::HashMap, fs, process::Command, sync::Arc};
use tokio::sync::{broadcast, RwLock};
use tokio_stream::{wrappers::BroadcastStream, Stream, StreamExt as _};
use tower_http::compression::CompressionLayer;
use tower_http::cors::{Any, CorsLayer};

const ECLUSAS_FILE:       &str = r"C:\wincc_state\eclusas.json";
const DB_FILE:            &str = r"C:\wincc_state\wincc_acesso.db";
const RDP_POLL_SECS:      u64  = 2;
const STARTUP_GRACE_SECS: u64  = 30;

// Estados de eclusa — usados pelo WinCC ao escrever no API
pub mod eclusa_status {
    pub const LIVRE:          i32 = 0;
    pub const OPERACAO_LOCAL: i32 = 1;
    pub const TELECOMANDO:    i32 = 2;
}

// ── Config ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Config {
    rdp_user:     String,
    rdp_password: String,
}

impl Default for Config {
    fn default() -> Self {
        Config { rdp_user: "Administrator".into(), rdp_password: "Rls@2024".into() }
    }
}

fn load_config() -> Config {
    std::env::current_exe().ok()
        .and_then(|p| p.parent().map(|d| d.join("config.json")))
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or_default()
}

const CLIENTES_IPS: [(&str, &str); 2] = [
    ("cliente1", "172.29.164.54"),
    ("cliente2", "172.29.164.58"),
];

// ── Tipos ─────────────────────────────────────────────────────────────────────

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
struct Supervisao {
    supervisor: String,
    timestamp:  String,
    ativo:      bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct Supervisoes { cliente1: Supervisao, cliente2: Supervisao }

#[derive(Debug, Clone)]
struct AppState {
    sessoes:     Sessoes,
    supervisoes: Supervisoes,
    rdp:         HashMap<String, RdpInfo>,
    operadores:  Vec<String>,
    startup:     std::time::Instant,
    sse_tx:      broadcast::Sender<String>,
    frame_tx:    HashMap<String, broadcast::Sender<Vec<u8>>>,
}

impl Default for AppState {
    fn default() -> Self {
        let (sse_tx, _) = broadcast::channel(64);
        let mut frame_tx = HashMap::new();
        for (cliente, _) in &CLIENTES_IPS {
            let (tx, _) = broadcast::channel::<Vec<u8>>(8);
            frame_tx.insert(cliente.to_string(), tx);
        }
        AppState {
            sessoes:     Sessoes::default(),
            supervisoes: Supervisoes::default(),
            rdp:         HashMap::default(),
            operadores:  Vec::default(),
            startup:     std::time::Instant::now(),
            sse_tx,
            frame_tx,
        }
    }
}

// ── Request types ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)] struct IniciarReq      { cliente: String, operador: String }
#[derive(Debug, Deserialize)] struct EncerrarReq     { cliente: String }
#[derive(Debug, Deserialize)] struct SupervisaoReq   { cliente: String, supervisor: String }
#[derive(Debug, Deserialize)] struct OperadorReq     { nome: String }
#[derive(Debug, Deserialize)] struct LoginReq        { username: String, password: String }
#[derive(Debug, Deserialize)] struct UsuarioReq      { username: String, password: String }

#[derive(Debug, Deserialize)]
struct EclusaEstadoReq {
    status:  i32,
    modo:    String,
    posto:   String,
    usuario: String,
}

// RwLock: múltiplas leituras paralelas sem bloquear; escritas exclusivas apenas quando necessário
type Shared = Arc<RwLock<AppState>>;

// ── Main ──────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    if let Err(e) = init_db() {
        println!("[{}] AVISO SQLite: {}", now(), e);
    }
    let operadores   = ler_operadores_db();
    let _total_users = contar_usuarios_db().unwrap_or(0);

    let cfg_startup = load_config();
    for (_, ip) in &CLIENTES_IPS {
        limpar_bloqueios_firewall(ip, &cfg_startup);
        configurar_shadow_servidor(ip, &cfg_startup); // shadow view-only sem consentimento
    }

    let state: Shared = Arc::new(RwLock::new(AppState { operadores, ..Default::default() }));

    // Polling RDP — paralelo nos dois servidores, só loga quando muda
    let state_bg = state.clone();
    tokio::spawn(async move {
        loop {
            let (r1, r2) = tokio::join!(
                tokio::task::spawn_blocking(|| verificar_rdp(CLIENTES_IPS[0].1)),
                tokio::task::spawn_blocking(|| verificar_rdp(CLIENTES_IPS[1].1)),
            );
            let infos = [
                (CLIENTES_IPS[0], r1.unwrap_or_default()),
                (CLIENTES_IPS[1], r2.unwrap_or_default()),
            ];

            let mut kills = vec![];
            {
                let mut st = state_bg.write().await;  // write exclusivo só aqui
                let grace = st.startup.elapsed().as_secs() > STARTUP_GRACE_SECS;

                for ((cliente, ip), info) in &infos {
                    let registado = match *cliente {
                        "cliente1" => st.sessoes.cliente1.conectado,
                        "cliente2" => st.sessoes.cliente2.conectado,
                        _          => false,
                    };
                    let nao_aut = info.ocupado && !registado;

                    let old = st.rdp.get(*cliente);
                    let mudou_ocupado = old.map(|o| o.ocupado    != info.ocupado).unwrap_or(true);
                    let mudou_verif   = old.map(|o| o.verificado != info.verificado).unwrap_or(true);

                    let mut new_info = info.clone();
                    new_info.nao_autorizado = nao_aut;
                    st.rdp.insert(cliente.to_string(), new_info);

                    // Auto-limpar supervisão se a sessão RDP terminou
                    if !info.ocupado {
                        let sup = match *cliente {
                            "cliente1" => &mut st.supervisoes.cliente1,
                            "cliente2" => &mut st.supervisoes.cliente2,
                            _          => continue,
                        };
                        if sup.ativo {
                            println!("[{}] SUPERVISAO auto-encerrada (RDP livre) em {}", now(), cliente);
                            *sup = Supervisao::default();
                        }
                    }

                    if grace && nao_aut && info.nome_sessao.starts_with("rdp-tcp#") {
                        if let Some(sid) = info.sessao_id {
                            println!("[{}] NAO AUTORIZADO: {} em {} — a desconectar", now(), info.utilizador, ip);
                            kills.push((ip.to_string(), sid));
                        }
                    } else if nao_aut && mudou_ocupado {
                        println!("[{}] AVISO nao autorizado em {} — {} (grace activo)", now(), ip, info.utilizador);
                    } else if !info.verificado && mudou_verif {
                        println!("[{}] RDP {} inacessivel ({})", now(), cliente, ip);
                    } else if info.verificado && mudou_verif {
                        println!("[{}] RDP {} recuperado ({})", now(), cliente, ip);
                    } else if mudou_ocupado {
                        if info.ocupado {
                            println!("[{}] RDP {}: OCUPADO — {}", now(), cliente, info.utilizador);
                        } else {
                            println!("[{}] RDP {}: LIVRE", now(), cliente);
                        }
                    }
                }
                broadcast_estado(&st);
            }

            // Kills em background — não atrasa o próximo poll
            for (ip, sid) in kills {
                tokio::task::spawn_blocking(move || {
                    let cfg = load_config();
                    let client_ip = obter_ip_cliente_rdp(&ip, sid, &cfg);
                    match Command::new("tsdiscon")
                        .args([&sid.to_string(), &format!("/server:{}", ip)])
                        .output()
                    {
                        Ok(o) if o.status.success() =>
                            println!("[{}] tsdiscon OK sessao {} em {}", now(), sid, ip),
                        Ok(o) =>
                            println!("[{}] tsdiscon falhou {:?} em {}", now(), o.status.code(), ip),
                        Err(e) =>
                            println!("[{}] tsdiscon erro em {}: {}", now(), ip, e),
                    }
                    if let Some(ref cip) = client_ip {
                        bloquear_ip_firewall(&ip, cip, &cfg);
                    } else {
                        println!("[{}] IP cliente nao obtido em {} — firewall nao aplicado", now(), ip);
                    }
                });
            }

            tokio::time::sleep(tokio::time::Duration::from_secs(RDP_POLL_SECS)).await;
        }
    });

    let cors        = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);
    let compression = CompressionLayer::new();

    let app = Router::new()
        .route("/stream/:cliente/frame", post(post_frame))
        .route("/stream/:cliente/mjpeg", get(get_mjpeg))
        .route("/stream/:cliente/ws",    get(ws_viewer))
        .route("/health",               get(health))
        .route("/eventos",              get(sse_eventos))
        .route("/eclusas",              get(get_eclusas))
        .route("/eclusas/:id/estado",   post(atualizar_eclusa))
        .route("/sessoes",              get(get_sessoes))
        .route("/sessoes/simples",      get(sessoes_simples))
        .route("/sessoes/shadow",       get(shadow_simples))
        .route("/sessoes/iniciar",      post(iniciar))
        .route("/sessoes/encerrar",     post(encerrar))
        .route("/supervisao/iniciar",   post(iniciar_supervisao))
        .route("/supervisao/encerrar",  post(encerrar_supervisao))
        .route("/estado",               get(get_estado))
        .route("/operadores",           get(get_operadores).post(add_operador))
        .route("/operadores/:nome",     delete(del_operador))
        .route("/auth/login",           post(auth_login))
        .route("/usuarios",             get(list_usuarios).post(create_usuario))
        .route("/usuarios/:username",   delete(delete_usuario))
        .with_state(state)
        .layer(cors)
        .layer(compression);

    let addr = "0.0.0.0:8080";
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!(" WinCC API  —  EDP Controlo de Acesso");
    println!(" Endereço   :  http://{}", addr);
    println!(" Base dados :  {}", DB_FILE);
    println!(" Eclusas    :  {}", ECLUSAS_FILE);
    println!(" Poll RDP   :  {}s", RDP_POLL_SECS);
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    loop {
        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(l)  => l,
            Err(e) => {
                println!("[{}] ERRO: porta {} ocupada — {}", now(), addr, e);
                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                continue;
            }
        };
        println!("[{}] A escutar em http://{}", now(), addr);
        match axum::serve(listener, app.clone().into_make_service_with_connect_info::<SocketAddr>()).await {
            Ok(())  => println!("[{}] AVISO: servidor parou — a reiniciar...", now()),
            Err(e)  => println!("[{}] ERRO servidor: {} — a reiniciar...", now(), e),
        }
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    }
}

// ── Stream de ecrã (MJPEG push) ──────────────────────────────────────────────

async fn post_frame(
    Path(cliente): Path<String>,
    State(s): State<Shared>,
    body: axum::body::Bytes,
) -> StatusCode {
    if body.is_empty() { return StatusCode::BAD_REQUEST; }
    let st = s.read().await;
    if let Some(tx) = st.frame_tx.get(&cliente) {
        let _ = tx.send(body.to_vec()); // broadcast para todos os viewers
    }
    StatusCode::OK
}

async fn get_mjpeg(Path(cliente): Path<String>, State(s): State<Shared>) -> axum::response::Response {
    use axum::response::IntoResponse;

    let rx = {
        let st = s.read().await;
        match st.frame_tx.get(&cliente) {
            Some(tx) => tx.subscribe(),
            None     => return StatusCode::NOT_FOUND.into_response(),
        }
    };

    let stream = BroadcastStream::new(rx).filter_map(|r| {
        let frame = r.ok()?; // descarta frames lagged
        let header = format!(
            "--mjpeg\r\nContent-Type: image/jpeg\r\nContent-Length: {}\r\n\r\n",
            frame.len()
        );
        let mut data = header.into_bytes();
        data.extend_from_slice(&frame);
        data.extend_from_slice(b"\r\n");
        Some(Ok::<axum::body::Bytes, std::convert::Infallible>(axum::body::Bytes::from(data)))
    });

    axum::response::Response::builder()
        .header("Content-Type", "multipart/x-mixed-replace; boundary=mjpeg")
        .header("Cache-Control", "no-cache, no-store, must-revalidate")
        .header("Access-Control-Allow-Origin", "*")
        .body(axum::body::Body::from_stream(stream))
        .unwrap()
}

// ── WebSocket viewer (latência mínima — sem buffer MJPEG) ────────────────────

async fn ws_viewer(
    ws:              WebSocketUpgrade,
    Path(cliente):   Path<String>,
    State(s):        State<Shared>,
) -> impl axum::response::IntoResponse {
    ws.on_upgrade(move |socket| handle_ws_viewer(socket, cliente, s))
}

async fn handle_ws_viewer(mut socket: WebSocket, cliente: String, s: Shared) {
    let mut rx = match s.read().await.frame_tx.get(&cliente) {
        Some(tx) => tx.subscribe(),
        None     => return,
    };
    loop {
        match rx.recv().await {
            Ok(frame) => {
                if socket.send(Message::Binary(frame)).await.is_err() { break; }
            }
            Err(broadcast::error::RecvError::Lagged(_)) => continue, // descarta frames atrasados
            Err(broadcast::error::RecvError::Closed)    => break,
        }
    }
}

// ── SSE ───────────────────────────────────────────────────────────────────────

fn broadcast_estado(st: &AppState) {
    let json = serde_json::to_string(&serde_json::json!({
        "eclusas":     ler_eclusas(),
        "sessoes":     { "cliente1": st.sessoes.cliente1, "cliente2": st.sessoes.cliente2 },
        "rdp":         st.rdp,
        "supervisoes": { "cliente1": st.supervisoes.cliente1, "cliente2": st.supervisoes.cliente2 },
        "operadores":  st.operadores,
        "timestamp":   now()
    })).unwrap_or_default();
    let _ = st.sse_tx.send(json);
}

async fn sse_eventos(State(s): State<Shared>) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = s.read().await.sse_tx.subscribe();
    let stream = BroadcastStream::new(rx)
        .filter_map(|r| r.ok())
        .map(|data| Ok::<Event, Infallible>(Event::default().data(data)));
    Sse::new(stream).keep_alive(KeepAlive::default())
}

// ── Handlers gerais ───────────────────────────────────────────────────────────

async fn health() -> Json<Value> {
    Json(serde_json::json!({ "status": "ok", "timestamp": now() }))
}

async fn get_eclusas() -> Json<Value> { Json(ler_eclusas()) }

async fn get_sessoes(State(s): State<Shared>) -> Json<Value> {
    let st = s.read().await;
    Json(serde_json::json!({ "cliente1": st.sessoes.cliente1, "cliente2": st.sessoes.cliente2 }))
}

async fn get_estado(State(s): State<Shared>) -> Json<Value> {
    let st = s.read().await;
    Json(serde_json::json!({
        "eclusas":     ler_eclusas(),
        "sessoes":     { "cliente1": st.sessoes.cliente1, "cliente2": st.sessoes.cliente2 },
        "rdp":         st.rdp,
        "supervisoes": { "cliente1": st.supervisoes.cliente1, "cliente2": st.supervisoes.cliente2 },
        "operadores":  st.operadores,
        "timestamp":   now()
    }))
}

async fn sessoes_simples(State(s): State<Shared>) -> String {
    let st = s.read().await;
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

async fn iniciar(
    State(s): State<Shared>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(req): Json<IniciarReq>,
) -> Json<Value> {
    let caller_ip = addr.ip().to_string();
    println!("[{}] INICIAR {} — {} (de {})", now(), req.cliente, req.operador, caller_ip);

    // Verificar sessão duplicada (leitura — não bloqueia outros leitores)
    {
        let st = s.read().await;
        let outro = match req.cliente.as_str() { "cliente1" => "cliente2", _ => "cliente1" };
        let outra = if outro == "cliente1" { &st.sessoes.cliente1 } else { &st.sessoes.cliente2 };
        if outra.conectado && outra.operador.eq_ignore_ascii_case(&req.operador) {
            println!("[{}] BLOQUEADO: {} já tem sessão em {}", now(), req.operador, outro);
            return Json(serde_json::json!({"ok": false, "erro": format!("Operador já tem sessão activa em {outro}")}));
        }
    }

    let target_ip = match req.cliente.as_str() {
        "cliente1" => CLIENTES_IPS[0].1.to_string(),
        "cliente2" => CLIENTES_IPS[1].1.to_string(),
        _          => return Json(serde_json::json!({"ok": false, "erro": "cliente inválido"})),
    };
    let ip_caller = caller_ip.clone();
    tokio::task::spawn_blocking(move || {
        desbloquear_ip_firewall(&target_ip, &ip_caller, &load_config());
    }).await.ok();

    let mut st = s.write().await;
    let nova = Sessao { operador: req.operador, timestamp_inicio: now(), conectado: true };
    match req.cliente.as_str() {
        "cliente1" => st.sessoes.cliente1 = nova,
        "cliente2" => st.sessoes.cliente2 = nova,
        _          => return Json(serde_json::json!({"ok": false, "erro": "cliente inválido"})),
    }
    broadcast_estado(&st);
    Json(serde_json::json!({"ok": true}))
}

async fn encerrar(State(s): State<Shared>, Json(req): Json<EncerrarReq>) -> Json<Value> {
    // Obter info da sessão RDP activa ANTES de limpar o estado
    let kill_info = {
        let st = s.read().await;
        let ip = match req.cliente.as_str() {
            "cliente1" => CLIENTES_IPS[0].1.to_string(),
            "cliente2" => CLIENTES_IPS[1].1.to_string(),
            _          => return Json(serde_json::json!({"ok": false, "erro": "cliente inválido"})),
        };
        st.rdp.get(&req.cliente)
            .filter(|r| r.ocupado && r.nome_sessao.starts_with("rdp-tcp#"))
            .and_then(|r| r.sessao_id)
            .map(|sid| (ip, sid))
    };

    // Limpar sessão + supervisão + push SSE
    {
        let mut st = s.write().await;
        match req.cliente.as_str() {
            "cliente1" => {
                st.sessoes.cliente1 = Sessao::default();
                if st.supervisoes.cliente1.ativo {
                    println!("[{}] SUPERVISAO auto-encerrada com sessao {}", now(), req.cliente);
                    st.supervisoes.cliente1 = Supervisao::default();
                }
            }
            "cliente2" => {
                st.sessoes.cliente2 = Sessao::default();
                if st.supervisoes.cliente2.ativo {
                    println!("[{}] SUPERVISAO auto-encerrada com sessao {}", now(), req.cliente);
                    st.supervisoes.cliente2 = Supervisao::default();
                }
            }
            _ => return Json(serde_json::json!({"ok": false, "erro": "cliente inválido"})),
        }
        broadcast_estado(&st);
    }

    println!("[{}] ENCERRAR {}", now(), req.cliente);

    // Desconectar sessão RDP em background — fire-and-forget
    if let Some((ip, sid)) = kill_info {
        tokio::task::spawn_blocking(move || {
            match Command::new("tsdiscon")
                .args([&sid.to_string(), &format!("/server:{}", ip)])
                .output()
            {
                Ok(o) if o.status.success() =>
                    println!("[{}] Sessão {} desconectada em {}", now(), sid, ip),
                Ok(o) =>
                    println!("[{}] tsdiscon falhou sessão {} em {}: {:?}", now(), sid, ip, o.status.code()),
                Err(e) =>
                    println!("[{}] tsdiscon erro: {}", now(), e),
            }
        });
    }

    Json(serde_json::json!({"ok": true}))
}

// POST /supervisao/iniciar — interlocks + regista supervisor
async fn iniciar_supervisao(State(s): State<Shared>, Json(req): Json<SupervisaoReq>) -> Json<Value> {
    // Leitura para verificar interlocks
    let (sessao_id, server_ip) = {
        let st = s.read().await;

        // Verificar se há sessão RDP activa
        let ip = match req.cliente.as_str() {
            "cliente1" => CLIENTES_IPS[0].1.to_string(),
            "cliente2" => CLIENTES_IPS[1].1.to_string(),
            _          => return Json(serde_json::json!({"ok": false, "erro": "cliente inválido"})),
        };
        let rdp = st.rdp.get(&req.cliente);
        let sid = rdp.and_then(|r| if r.ocupado { r.sessao_id } else { None });
        match sid {
            Some(id) => (id, ip),
            None     => return Json(serde_json::json!({"ok": false, "erro": "Sem sessão RDP activa — operador não está conectado"})),
        }
    };

    // Segunda leitura: verificar se já existe supervisor activo
    {
        let st = s.read().await;
        let sup = match req.cliente.as_str() {
            "cliente1" => &st.supervisoes.cliente1,
            _          => &st.supervisoes.cliente2,
        };
        if sup.ativo {
            return Json(serde_json::json!({
                "ok":   false,
                "erro": format!("Supervisão já activa por {}", sup.supervisor)
            }));
        }
    }

    // Registar supervisão
    let mut st = s.write().await;
    let nova = Supervisao { supervisor: req.supervisor.clone(), timestamp: now(), ativo: true };
    match req.cliente.as_str() {
        "cliente1" => st.supervisoes.cliente1 = nova,
        _          => st.supervisoes.cliente2 = nova,
    }
    broadcast_estado(&st);
    println!("[{}] SUPERVISAO INICIADA {} — {} (sessao {})", now(), req.cliente, req.supervisor, sessao_id);
    Json(serde_json::json!({ "ok": true, "sessao_id": sessao_id, "server_ip": server_ip }))
}

// POST /supervisao/encerrar — limpa supervisor
async fn encerrar_supervisao(State(s): State<Shared>, Json(req): Json<EncerrarReq>) -> Json<Value> {
    let mut st = s.write().await;
    let supervisor = match req.cliente.as_str() {
        "cliente1" => { let s = st.supervisoes.cliente1.supervisor.clone(); st.supervisoes.cliente1 = Supervisao::default(); s }
        "cliente2" => { let s = st.supervisoes.cliente2.supervisor.clone(); st.supervisoes.cliente2 = Supervisao::default(); s }
        _          => return Json(serde_json::json!({"ok": false, "erro": "cliente inválido"})),
    };
    broadcast_estado(&st);
    println!("[{}] SUPERVISAO ENCERRADA {} — {}", now(), req.cliente, supervisor);
    Json(serde_json::json!({"ok": true}))
}

// Informação para shadow session — GET /sessoes/shadow
// Retorna texto simples para o VBScript de supervisão
async fn shadow_simples(State(s): State<Shared>) -> String {
    let st = s.read().await;
    let (sid1, ip1) = st.rdp.get("cliente1")
        .filter(|r| r.ocupado)
        .and_then(|r| r.sessao_id.map(|sid| (sid, CLIENTES_IPS[0].1)))
        .unwrap_or((0, CLIENTES_IPS[0].1));
    let (sid2, ip2) = st.rdp.get("cliente2")
        .filter(|r| r.ocupado)
        .and_then(|r| r.sessao_id.map(|sid| (sid, CLIENTES_IPS[1].1)))
        .unwrap_or((0, CLIENTES_IPS[1].1));
    format!(
        "Cliente1_SessaoId={}\nCliente1_Server={}\nCliente2_SessaoId={}\nCliente2_Server={}\n",
        sid1, ip1, sid2, ip2
    )
}

// WinCC escreve estado da eclusa — POST /eclusas/:id/estado
// Corpo: {"status":0,"modo":"LIVRE","posto":"","usuario":""}
// status: 0=LIVRE  1=OPERACAO_LOCAL  2=TELECOMANDO
async fn atualizar_eclusa(
    Path(id): Path<String>,
    State(s): State<Shared>,
    Json(req): Json<EclusaEstadoReq>,
) -> Json<Value> {
    const VALIDAS: [&str; 5] = ["CL", "CM", "PN", "RG", "VR"];
    let id = id.to_uppercase();
    if !VALIDAS.contains(&id.as_str()) {
        return Json(serde_json::json!({"ok": false, "erro": "eclusa invalida"}));
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
        return Json(serde_json::json!({"ok": false, "erro": format!("ficheiro: {e}")}));
    }

    println!("[{}] Eclusa {} -> status={} modo={} usuario={}", now(), id, req.status, req.modo, req.usuario);

    let st = s.read().await;
    broadcast_estado(&st);
    Json(serde_json::json!({"ok": true}))
}

// ── Operadores CRUD ───────────────────────────────────────────────────────────

async fn get_operadores(State(s): State<Shared>) -> Json<Value> {
    Json(serde_json::json!(s.read().await.operadores))
}

async fn add_operador(State(s): State<Shared>, Json(req): Json<OperadorReq>) -> Json<Value> {
    let nome = req.nome.trim().to_string();
    if nome.is_empty() { return Json(serde_json::json!({"ok": false, "erro": "nome vazio"})); }
    let mut st = s.write().await;
    if st.operadores.iter().any(|o| o.eq_ignore_ascii_case(&nome)) {
        return Json(serde_json::json!({"ok": false, "erro": "já existe"}));
    }
    let n = nome.clone();
    if let Ok(Err(e)) = tokio::task::spawn_blocking(move || inserir_operador_db(&n)).await {
        return Json(serde_json::json!({"ok": false, "erro": format!("db: {e}")}));
    }
    st.operadores.push(nome);
    st.operadores.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    Json(serde_json::json!({"ok": true}))
}

async fn del_operador(State(s): State<Shared>, Path(nome): Path<String>) -> Json<Value> {
    let mut st = s.write().await;
    let antes = st.operadores.len();
    st.operadores.retain(|o| !o.eq_ignore_ascii_case(&nome));
    if st.operadores.len() == antes {
        return Json(serde_json::json!({"ok": false, "erro": "não encontrado"}));
    }
    let n = nome.clone();
    tokio::task::spawn_blocking(move || remover_operador_db(&n)).await.ok();
    Json(serde_json::json!({"ok": true}))
}

// ── Auth & Utilizadores ───────────────────────────────────────────────────────

async fn auth_login(Json(req): Json<LoginReq>) -> Json<Value> {
    let username = req.username.trim().to_string();
    let password = req.password.clone();
    match tokio::task::spawn_blocking(move || verificar_credenciais(&username, &password)).await {
        Ok(Ok(true))  => {
            println!("[{}] Login OK: {}", now(), req.username.trim());
            Json(serde_json::json!({"ok": true}))
        }
        Ok(Ok(false)) => {
            println!("[{}] Login FALHOU: {}", now(), req.username.trim());
            Json(serde_json::json!({"ok": false, "erro": "Credenciais inválidas"}))
        }
        _ => Json(serde_json::json!({"ok": false, "erro": "Erro interno"})),
    }
}

async fn list_usuarios() -> Json<Value> {
    match tokio::task::spawn_blocking(ler_usuarios_db).await {
        Ok(lista) => Json(serde_json::json!(lista)),
        Err(_)    => Json(serde_json::json!([])),
    }
}

async fn create_usuario(Json(req): Json<UsuarioReq>) -> Json<Value> {
    let username = req.username.trim().to_string();
    let password = req.password.clone();
    if username.is_empty() { return Json(serde_json::json!({"ok": false, "erro": "username vazio"})); }
    if password.is_empty() { return Json(serde_json::json!({"ok": false, "erro": "password vazia"})); }
    match tokio::task::spawn_blocking(move || inserir_usuario_db(&username, &password)).await {
        Ok(Ok(())) => {
            println!("[{}] Utilizador criado: {}", now(), req.username.trim());
            Json(serde_json::json!({"ok": true}))
        }
        Ok(Err(e)) => Json(serde_json::json!({"ok": false, "erro": format!("{e}")})),
        Err(_)     => Json(serde_json::json!({"ok": false, "erro": "Erro interno"})),
    }
}

async fn delete_usuario(Path(username): Path<String>) -> Json<Value> {
    let u = username.clone();
    match tokio::task::spawn_blocking(move || remover_usuario_db(&u)).await {
        Ok(Ok(())) => {
            println!("[{}] Utilizador removido: {}", now(), username);
            Json(serde_json::json!({"ok": true}))
        }
        Ok(Err(e)) => Json(serde_json::json!({"ok": false, "erro": format!("{e}")})),
        Err(_)     => Json(serde_json::json!({"ok": false, "erro": "Erro interno"})),
    }
}

// ── SQLite ────────────────────────────────────────────────────────────────────

fn init_db() -> rusqlite::Result<()> {
    let conn = Connection::open(DB_FILE)?;
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS operadores (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            nome      TEXT NOT NULL UNIQUE COLLATE NOCASE,
            criado_em TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS usuarios (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            criado_em     TEXT NOT NULL
        );
    ")?;
    Ok(())
}

fn contar_usuarios_db() -> rusqlite::Result<u32> {
    let conn = Connection::open(DB_FILE)?;
    conn.query_row("SELECT COUNT(*) FROM usuarios", [], |row| row.get(0))
}

fn hash_password(username: &str, password: &str) -> String {
    let mut h = Sha256::new();
    h.update(format!("{}:{}", username.to_lowercase(), password).as_bytes());
    format!("{:x}", h.finalize())
}

fn verificar_credenciais(username: &str, password: &str) -> rusqlite::Result<bool> {
    let conn = Connection::open(DB_FILE)?;
    let hash = hash_password(username, password);
    conn.query_row(
        "SELECT COUNT(*) > 0 FROM usuarios WHERE username = ?1 AND password_hash = ?2 COLLATE NOCASE",
        rusqlite::params![username, hash],
        |row| row.get(0),
    )
}

fn ler_usuarios_db() -> Vec<serde_json::Value> {
    let conn = match Connection::open(DB_FILE) { Ok(c) => c, Err(_) => return vec![] };
    let mut stmt = match conn.prepare(
        "SELECT username, criado_em FROM usuarios ORDER BY username COLLATE NOCASE"
    ) { Ok(s) => s, Err(_) => return vec![] };
    stmt.query_map([], |row| {
        Ok(serde_json::json!({ "username": row.get::<_, String>(0)?, "criado_em": row.get::<_, String>(1)? }))
    })
    .map(|rows| rows.filter_map(|r| r.ok()).collect())
    .unwrap_or_default()
}

fn inserir_usuario_db(username: &str, password: &str) -> rusqlite::Result<()> {
    let conn = Connection::open(DB_FILE)?;
    let hash = hash_password(username, password);
    conn.execute(
        "INSERT INTO usuarios (username, password_hash, criado_em) VALUES (?1, ?2, ?3)",
        rusqlite::params![username, hash, now()],
    )?;
    Ok(())
}

fn remover_usuario_db(username: &str) -> rusqlite::Result<()> {
    let conn = Connection::open(DB_FILE)?;
    conn.execute("DELETE FROM usuarios WHERE username = ?1 COLLATE NOCASE", rusqlite::params![username])?;
    Ok(())
}

fn ler_operadores_db() -> Vec<String> {
    let conn = match Connection::open(DB_FILE) { Ok(c) => c, Err(_) => return vec![] };
    let mut stmt = match conn.prepare("SELECT nome FROM operadores ORDER BY nome COLLATE NOCASE") {
        Ok(s) => s, Err(_) => return vec![]
    };
    stmt.query_map([], |row| row.get::<_, String>(0))
        .map(|rows| rows.filter_map(|r| r.ok()).collect())
        .unwrap_or_default()
}

fn inserir_operador_db(nome: &str) -> rusqlite::Result<()> {
    let conn = Connection::open(DB_FILE)?;
    conn.execute("INSERT OR IGNORE INTO operadores (nome, criado_em) VALUES (?1, ?2)", rusqlite::params![nome, now()])?;
    Ok(())
}

fn remover_operador_db(nome: &str) -> rusqlite::Result<()> {
    let conn = Connection::open(DB_FILE)?;
    conn.execute("DELETE FROM operadores WHERE nome = ?1 COLLATE NOCASE", rusqlite::params![nome])?;
    Ok(())
}

// ── RDP ───────────────────────────────────────────────────────────────────────

fn verificar_rdp(ip: &str) -> RdpInfo {
    match Command::new("qwinsta").arg(format!("/server:{}", ip)).output() {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let (ocupado, utilizador, nome_sessao, sessao_id) = parse_qwinsta(&stdout);
            RdpInfo { ocupado, utilizador, verificado: true, timestamp: now(), nome_sessao, sessao_id, ..Default::default() }
        }
        Err(e) => {
            println!("[{}] qwinsta {} erro: {}", now(), ip, e);
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
                if ip != "0.0.0.0" && !ip.starts_with("0.") {
                    println!("[{}] IP cliente RDP em {}: {}", now(), server_ip, ip);
                    Some(ip)
                } else { None }
            } else { None }
        } else {
            println!("[{}] WTSQuery falhou em {} sessão {} — {:?}", now(), server_ip, session_id, ok.err());
            None
        };
        if !buf.is_null() { WTSFreeMemory(buf.as_ptr() as *mut _); }
        WTSCloseServer(server);
        ip
    }
}

fn desbloquear_ip_firewall(server_ip: &str, client_ip: &str, cfg: &Config) {
    let rule_name = format!("EDP-Block-RDP-{}", client_ip.replace('.', "-"));
    let ps  = format!(
        "Remove-NetFirewallRule -DisplayName '{name}' -ErrorAction SilentlyContinue; Write-Output 'OK'",
        name = rule_name
    );
    let cmd = format!("powershell.exe -NonInteractive -Command \"{}\"", ps);
    match Command::new("wmic").args([
        &format!("/node:{}", server_ip), &format!("/user:{}", cfg.rdp_user),
        &format!("/password:{}", cfg.rdp_password), "process", "call", "create", &cmd,
    ]).output() {
        Ok(_)  => println!("[{}] IP {} desbloqueado em {}", now(), client_ip, server_ip),
        Err(e) => println!("[{}] Desbloqueio {} em {} falhou: {}", now(), client_ip, server_ip, e),
    }
    std::thread::sleep(std::time::Duration::from_secs(3));
}

fn limpar_bloqueios_firewall(server_ip: &str, cfg: &Config) {
    let ps  = "Get-NetFirewallRule -DisplayName 'EDP-Block-RDP-*' -ErrorAction SilentlyContinue | Remove-NetFirewallRule; Write-Output 'OK'";
    let cmd = format!("powershell.exe -NonInteractive -Command \"{}\"", ps);
    match Command::new("wmic").args([
        &format!("/node:{}", server_ip), &format!("/user:{}", cfg.rdp_user),
        &format!("/password:{}", cfg.rdp_password), "process", "call", "create", &cmd,
    ]).output() {
        Ok(_)  => println!("[{}] Bloqueios limpos em {}", now(), server_ip),
        Err(e) => println!("[{}] Limpeza bloqueios em {} — {}", now(), server_ip, e),
    }
}

// Configura shadow mode no servidor: view-only sem precisar de consentimento do operador
// Shadow=4: View-only without user's permission (Windows Server 2012 R2+)
fn configurar_shadow_servidor(server_ip: &str, cfg: &Config) {
    let ps = "$p='HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services'; \
        if(-not(Test-Path $p)){New-Item -Path $p -Force|Out-Null}; \
        Set-ItemProperty -Path $p -Name 'Shadow' -Value 4 -Type DWord -Force; \
        Write-Output 'OK'";
    let cmd = format!("powershell.exe -NonInteractive -Command \"{}\"", ps);
    match Command::new("wmic").args([
        &format!("/node:{}", server_ip), &format!("/user:{}", cfg.rdp_user),
        &format!("/password:{}", cfg.rdp_password), "process", "call", "create", &cmd,
    ]).output() {
        Ok(_)  => println!("[{}] Shadow full-control configurado em {}", now(), server_ip),
        Err(e) => println!("[{}] Shadow config em {} falhou: {}", now(), server_ip, e),
    }
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
    match Command::new("wmic").args([
        &format!("/node:{}", server_ip), &format!("/user:{}", cfg.rdp_user),
        &format!("/password:{}", cfg.rdp_password), "process", "call", "create", &cmd,
    ]).output() {
        Ok(o) => {
            let out = String::from_utf8_lossy(&o.stdout);
            println!("[{}] Firewall block {} em {}: {}", now(), client_ip, server_ip,
                out.trim().lines().next().unwrap_or("iniciado"));
            std::thread::sleep(std::time::Duration::from_secs(4));
        }
        Err(e) => println!("[{}] Firewall block falhou {} em {}: {}", now(), client_ip, server_ip, e),
    }
}

// ── Eclusas ───────────────────────────────────────────────────────────────────

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
