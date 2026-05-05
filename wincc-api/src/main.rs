use axum::{
    extract::{ConnectInfo, Path, State},
    response::{Json, Sse},
    response::sse::{Event, KeepAlive},
    routing::{delete, get, post},
    Router,
};
use std::{convert::Infallible, net::SocketAddr};
use chrono::Local;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::HashMap, fs, process::Command, sync::Arc};
use tokio::sync::{broadcast, Mutex};
use tokio_stream::{wrappers::BroadcastStream, Stream, StreamExt as _};
use tower_http::cors::{Any, CorsLayer};

const ECLUSAS_FILE:       &str = r"C:\wincc_state\eclusas.json";
const DB_FILE:            &str = r"C:\wincc_state\wincc_acesso.db";
const RDP_POLL_SECS:      u64 = 2;  // poll a cada 2s — frontend vê mudanças em <3s
const STARTUP_GRACE_SECS: u64 = 30; // 30s sem kills logo após arranque da API

// ── Config (lida de config.json junto ao exe) ─────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Config {
    rdp_user:     String,
    rdp_password: String,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            rdp_user:     "Administrator".to_string(),
            rdp_password: "Rls@2024".to_string(),
        }
    }
}

fn load_config() -> Config {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    if let Some(dir) = exe_dir {
        if let Ok(content) = fs::read_to_string(dir.join("config.json")) {
            if let Ok(cfg) = serde_json::from_str::<Config>(&content) {
                return cfg;
            }
        }
    }
    Config::default()
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
    #[serde(skip)] nome_sessao: String,   // "rdp-tcp#N" — só este tipo é desconectado
    #[serde(skip)] sessao_id:   Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct Sessoes { cliente1: Sessao, cliente2: Sessao }

#[derive(Debug, Clone)]
struct AppState {
    sessoes:    Sessoes,
    rdp:        HashMap<String, RdpInfo>,
    operadores: Vec<String>,
    startup:    std::time::Instant,
    sse_tx:     broadcast::Sender<String>, // push instantâneo para o frontend via SSE
}

impl Default for AppState {
    fn default() -> Self {
        let (sse_tx, _) = broadcast::channel(32);
        AppState {
            sessoes:    Sessoes::default(),
            rdp:        HashMap::default(),
            operadores: Vec::default(),
            startup:    std::time::Instant::now(),
            sse_tx,
        }
    }
}

#[derive(Debug, Deserialize)] struct IniciarReq  { cliente: String, operador: String }
#[derive(Debug, Deserialize)] struct EncerrarReq { cliente: String }
#[derive(Debug, Deserialize)] struct OperadorReq { nome: String }
#[derive(Debug, Deserialize)] struct LoginReq    { username: String, password: String }
#[derive(Debug, Deserialize)] struct UsuarioReq  { username: String, password: String }

type Shared = Arc<Mutex<AppState>>;

// ── Main ──────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    if let Err(e) = init_db() {
        println!("[{}] AVISO SQLite init: {}", now(), e);
    }
    let operadores = ler_operadores_db();
    let total_users = contar_usuarios_db().unwrap_or(0);
    println!("[{}] Operadores: {} | Utilizadores: {}", now(), operadores.len(), total_users);

    // Limpar bloqueios de firewall anteriores em ambos os servidores
    // Garante que nenhum IP fica bloqueado permanentemente entre reinicios da API
    let cfg_startup = load_config();
    for (_, ip) in &CLIENTES_IPS {
        limpar_bloqueios_firewall(ip, &cfg_startup);
    }

    let state: Shared = Arc::new(Mutex::new(AppState { operadores, ..Default::default() }));

    // Polling RDP — qwinsta em paralelo nos dois servidores + SSE push instantâneo
    let state_bg = state.clone();
    tokio::spawn(async move {
        loop {
            // Verificar os dois servidores ao mesmo tempo (antes: sequencial = 2-4s; agora: 1-2s)
            let (r1, r2) = tokio::join!(
                tokio::task::spawn_blocking(|| verificar_rdp(CLIENTES_IPS[0].1)),
                tokio::task::spawn_blocking(|| verificar_rdp(CLIENTES_IPS[1].1)),
            );
            let infos = [
                (CLIENTES_IPS[0], r1.unwrap_or_default()),
                (CLIENTES_IPS[1], r2.unwrap_or_default()),
            ];

            // Atualizar estado + push SSE IMEDIATO — não espera pelos kills
            let mut kills = vec![];
            {
                let mut st = state_bg.lock().await;
                let grace = st.startup.elapsed().as_secs() > STARTUP_GRACE_SECS;
                for ((cliente, ip), info) in &infos {
                    let registado = match *cliente {
                        "cliente1" => st.sessoes.cliente1.conectado,
                        "cliente2" => st.sessoes.cliente2.conectado,
                        _          => false,
                    };
                    let nao_aut = info.ocupado && !registado;
                    let mut new_info = info.clone();
                    new_info.nao_autorizado = nao_aut;
                    st.rdp.insert(cliente.to_string(), new_info);

                    if grace && nao_aut && info.nome_sessao.starts_with("rdp-tcp#") {
                        if let Some(sid) = info.sessao_id {
                            println!("[{}] NAO AUTORIZADO: {} (id={}) em {} -- {} -- a desconectar",
                                now(), info.nome_sessao, sid, ip, info.utilizador);
                            kills.push((ip.to_string(), sid));
                        }
                    } else if nao_aut {
                        println!("[{}] AVISO (grace) sessao nao autorizada em {} -- {}", now(), ip, info.utilizador);
                    } else {
                        println!("[{}] RDP {} ({}) -- ocupado={} verificado={}", now(), cliente, ip, info.ocupado, info.verificado);
                    }
                }
                broadcast_estado(&st); // SSE push imediato — frontend vê em <100ms
            }

            // tsdiscon + firewall em background — fire-and-forget, não atrasa o poll
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
                            println!("[{}] tsdiscon codigo {:?} em {}", now(), o.status.code(), ip),
                        Err(e) =>
                            println!("[{}] tsdiscon erro em {}: {}", now(), ip, e),
                    }
                    if let Some(ref cip) = client_ip {
                        bloquear_ip_firewall(&ip, cip, &cfg);
                    } else {
                        println!("[{}] IP cliente nao obtido em {} -- firewall nao aplicado", now(), ip);
                    }
                });
            }

            tokio::time::sleep(tokio::time::Duration::from_secs(RDP_POLL_SECS)).await;
        }
    });

    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);

    let app = Router::new()
        .route("/health",           get(health))
        .route("/eventos",          get(sse_eventos))  // SSE — push em tempo real
        .route("/eclusas",          get(get_eclusas))
        .route("/sessoes",          get(get_sessoes))
        .route("/estado",           get(get_estado))
        .route("/sessoes/iniciar",  post(iniciar))
        .route("/sessoes/encerrar", post(encerrar))
        .route("/operadores",       get(get_operadores).post(add_operador))
        .route("/operadores/:nome", delete(del_operador))
        .route("/auth/login",       post(auth_login))
        .route("/usuarios",         get(list_usuarios).post(create_usuario))
        .route("/usuarios/:username", delete(delete_usuario))
        .with_state(state)
        .layer(cors);

    let addr = "0.0.0.0:8080";
    println!("[{}] WinCC API  — http://{}", now(), addr);
    println!("[{}] Base dados — {}", now(), DB_FILE);
    println!("[{}] Eclusas   — {}", now(), ECLUSAS_FILE);
    println!("[{}] Polling RDP a cada {}s", now(), RDP_POLL_SECS);

    axum::serve(
        tokio::net::TcpListener::bind(addr).await.unwrap(),
        app.into_make_service_with_connect_info::<SocketAddr>(),
    ).await.unwrap();
}

// ── Handlers gerais ───────────────────────────────────────────────────────────

async fn health() -> Json<Value> {
    Json(serde_json::json!({ "status": "ok", "timestamp": now() }))
}
// ── SSE ───────────────────────────────────────────────────────────────────────

// Serializa e envia o estado completo para todos os clientes SSE ligados
fn broadcast_estado(st: &AppState) {
    let json = serde_json::to_string(&serde_json::json!({
        "eclusas":    ler_eclusas(),
        "sessoes":    { "cliente1": st.sessoes.cliente1, "cliente2": st.sessoes.cliente2 },
        "rdp":        st.rdp,
        "operadores": st.operadores,
        "timestamp":  now()
    })).unwrap_or_default();
    let _ = st.sse_tx.send(json); // ignora se não houver subscritores
}

// Endpoint SSE — o frontend liga uma vez e recebe updates em tempo real
async fn sse_eventos(State(s): State<Shared>) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = s.lock().await.sse_tx.subscribe();
    let stream = BroadcastStream::new(rx)
        .filter_map(|r| r.ok())
        .map(|data| Ok::<Event, Infallible>(Event::default().data(data)));
    Sse::new(stream).keep_alive(KeepAlive::default())
}

async fn get_eclusas() -> Json<Value> { Json(ler_eclusas()) }

async fn get_sessoes(State(s): State<Shared>) -> Json<Value> {
    let st = s.lock().await;
    Json(serde_json::json!({ "cliente1": st.sessoes.cliente1, "cliente2": st.sessoes.cliente2 }))
}

async fn get_estado(State(s): State<Shared>) -> Json<Value> {
    let st = s.lock().await;
    Json(serde_json::json!({
        "eclusas":    ler_eclusas(),
        "sessoes":    { "cliente1": st.sessoes.cliente1, "cliente2": st.sessoes.cliente2 },
        "rdp":        st.rdp,
        "operadores": st.operadores,
        "timestamp":  now()
    }))
}

async fn iniciar(
    State(s): State<Shared>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(req): Json<IniciarReq>,
) -> Json<Value> {
    let caller_ip = addr.ip().to_string();
    println!("[{}] /sessoes/iniciar {} — \"{}\" (de {})", now(), req.cliente, req.operador, caller_ip);

    // Impedir que o mesmo operador abra duas sessões em simultâneo
    {
        let st = s.lock().await;
        let outro_cliente = match req.cliente.as_str() { "cliente1" => "cliente2", _ => "cliente1" };
        let outra = if outro_cliente == "cliente1" { &st.sessoes.cliente1 } else { &st.sessoes.cliente2 };
        if outra.conectado && outra.operador.eq_ignore_ascii_case(&req.operador) {
            println!("[{}] BLOQUEADO: {} já tem sessão em {}", now(), req.operador, outro_cliente);
            return Json(serde_json::json!({"ok": false, "erro": format!("Operador já tem sessão ativa em {outro_cliente}")}));
        }
    }

    // Desbloquear o IP do mini PC no servidor alvo antes de permitir a sessão RDP
    // Garante que um IP bloqueado por acesso não autorizado volta a funcionar quando
    // o operador acede corretamente pelo nosso sistema com credenciais válidas
    let target_ip = match req.cliente.as_str() {
        "cliente1" => CLIENTES_IPS[0].1.to_string(),
        "cliente2" => CLIENTES_IPS[1].1.to_string(),
        _          => return Json(serde_json::json!({"ok": false, "erro": "cliente inválido"})),
    };
    let ip_para_desbloquear = caller_ip.clone();
    tokio::task::spawn_blocking(move || {
        let cfg = load_config();
        desbloquear_ip_firewall(&target_ip, &ip_para_desbloquear, &cfg);
    }).await.ok();

    // Registar sessão + push SSE imediato
    let mut st = s.lock().await;
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
    println!("[{}] /sessoes/encerrar {}", now(), req.cliente);
    let mut st = s.lock().await;
    match req.cliente.as_str() {
        "cliente1" => st.sessoes.cliente1 = Sessao::default(),
        "cliente2" => st.sessoes.cliente2 = Sessao::default(),
        _          => return Json(serde_json::json!({"ok": false, "erro": "cliente inválido"})),
    }
    broadcast_estado(&st);
    Json(serde_json::json!({"ok": true}))
}

// ── Operadores CRUD ───────────────────────────────────────────────────────────

async fn get_operadores(State(s): State<Shared>) -> Json<Value> {
    Json(serde_json::json!(s.lock().await.operadores))
}

async fn add_operador(State(s): State<Shared>, Json(req): Json<OperadorReq>) -> Json<Value> {
    let nome = req.nome.trim().to_string();
    if nome.is_empty() { return Json(serde_json::json!({"ok": false, "erro": "nome vazio"})); }
    let mut st = s.lock().await;
    if st.operadores.iter().any(|o| o.eq_ignore_ascii_case(&nome)) {
        return Json(serde_json::json!({"ok": false, "erro": "já existe"}));
    }
    let n = nome.clone();
    if let Ok(Err(e)) = tokio::task::spawn_blocking(move || inserir_operador_db(&n)).await {
        return Json(serde_json::json!({"ok": false, "erro": format!("db: {e}")}));
    }
    st.operadores.push(nome.clone());
    st.operadores.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    Json(serde_json::json!({"ok": true}))
}

async fn del_operador(State(s): State<Shared>, Path(nome): Path<String>) -> Json<Value> {
    let mut st = s.lock().await;
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
    let resultado = tokio::task::spawn_blocking(move || verificar_credenciais(&username, &password)).await;
    match resultado {
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
    let resultado = tokio::task::spawn_blocking(ler_usuarios_db).await;
    match resultado {
        Ok(lista) => Json(serde_json::json!(lista)),
        Err(_)    => Json(serde_json::json!([])),
    }
}

async fn create_usuario(Json(req): Json<UsuarioReq>) -> Json<Value> {
    let username = req.username.trim().to_string();
    let password = req.password.clone();
    if username.is_empty() {
        return Json(serde_json::json!({"ok": false, "erro": "username vazio"}));
    }
    if password.is_empty() {
        return Json(serde_json::json!({"ok": false, "erro": "password vazia"}));
    }
    let resultado = tokio::task::spawn_blocking(move || inserir_usuario_db(&username, &password)).await;
    match resultado {
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
    let resultado = tokio::task::spawn_blocking(move || remover_usuario_db(&u)).await;
    match resultado {
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

// Utilizadores

fn hash_password(username: &str, password: &str) -> String {
    let mut h = Sha256::new();
    h.update(format!("{}:{}", username.to_lowercase(), password).as_bytes());
    format!("{:x}", h.finalize())
}

fn verificar_credenciais(username: &str, password: &str) -> rusqlite::Result<bool> {
    let conn = Connection::open(DB_FILE)?;
    let hash = hash_password(username, password);
    let existe: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM usuarios WHERE username = ?1 AND password_hash = ?2 COLLATE NOCASE",
        rusqlite::params![username, hash],
        |row| row.get(0),
    )?;
    Ok(existe)
}

fn ler_usuarios_db() -> Vec<serde_json::Value> {
    let conn = match Connection::open(DB_FILE) {
        Ok(c) => c, Err(_) => return vec![],
    };
    let mut stmt = match conn.prepare("SELECT username, criado_em FROM usuarios ORDER BY username COLLATE NOCASE") {
        Ok(s) => s, Err(_) => return vec![],
    };
    stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "username":  row.get::<_, String>(0)?,
            "criado_em": row.get::<_, String>(1)?,
        }))
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

// Operadores

fn ler_operadores_db() -> Vec<String> {
    let conn = match Connection::open(DB_FILE) {
        Ok(c) => c, Err(_) => return vec![],
    };
    let mut stmt = match conn.prepare("SELECT nome FROM operadores ORDER BY nome COLLATE NOCASE") {
        Ok(s) => s, Err(_) => return vec![],
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

// ── RDP check via qwinsta ─────────────────────────────────────────────────────

fn verificar_rdp(ip: &str) -> RdpInfo {
    let result = Command::new("qwinsta").arg(format!("/server:{}", ip)).output();
    match result {
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

// Colunas fixas qwinsta:
//  SESSIONNAME  USERNAME  ID  STATE
// >rdp-tcp#2   Administrator  2  Active
// Só "rdp-tcp#N" é elegível para tsdiscon — console/services são intocáveis.
fn parse_qwinsta(output: &str) -> (bool, String, String, Option<u32>) {
    for line in output.lines().skip(1) {
        if line.contains("Listen") { continue; }
        if !line.to_uppercase().contains("ACTIVE") { continue; }

        let nome_sessao = if line.len() > 18 { line[1..18].trim().to_string() } else { String::new() };

        let username = if line.len() > 42 { line[19..42].trim().to_string() }
                       else if line.len() > 19 { line[19..].trim().to_string() }
                       else { String::new() };

        let sessao_id: Option<u32> = if line.len() > 47 { line[42..47].trim().parse().ok() }
                                     else { None };

        return (true, username, nome_sessao, sessao_id);
    }
    (false, String::new(), String::new(), None)
}

// Obtém o IP do cliente RDP via WTS API (mesmo protocolo que qwinsta — sem WMI)
fn obter_ip_cliente_rdp(server_ip: &str, session_id: u32, _cfg: &Config) -> Option<String> {
    use windows::Win32::System::RemoteDesktop::{
        WTSCloseServer, WTSFreeMemory, WTSOpenServerW, WTSQuerySessionInformationW,
        WTS_CLIENT_ADDRESS, WTSClientAddress,
    };
    use windows::core::{PCWSTR, PWSTR};

    unsafe {
        let wide: Vec<u16> = server_ip.encode_utf16().chain(std::iter::once(0)).collect();
        let server = WTSOpenServerW(PCWSTR(wide.as_ptr()));

        let mut buf = PWSTR::null();
        let mut bytes: u32 = 0;

        let resultado = WTSQuerySessionInformationW(
            server,
            session_id,
            WTSClientAddress,
            &mut buf,
            &mut bytes,
        );

        let ip = if resultado.is_ok() && !buf.is_null() {
            let addr = &*(buf.as_ptr() as *const WTS_CLIENT_ADDRESS);
            // AddressFamily 2 = AF_INET; octetos em Address[2..5]
            if addr.AddressFamily == 2 {
                let a = &addr.Address;
                let ip = format!("{}.{}.{}.{}", a[2], a[3], a[4], a[5]);
                if ip != "0.0.0.0" && !ip.starts_with("0.") {
                    println!("[{}] IP cliente RDP em {}: {}", now(), server_ip, ip);
                    Some(ip)
                } else { None }
            } else { None }
        } else {
            println!("[{}] WTSQuerySessionInformation falhou em {} sessão {} — {:?}",
                now(), server_ip, session_id, resultado.err());
            None
        };

        if !buf.is_null() { WTSFreeMemory(buf.as_ptr() as *mut _); }
        WTSCloseServer(server);
        ip
    }
}

// Remove todos os bloqueios EDP anteriores — chamado no arranque da API
// Garante que nenhum IP fica permanentemente bloqueado entre reinícios
// Remove o bloqueio de um IP específico — chamado quando operador acede com credenciais válidas
fn desbloquear_ip_firewall(server_ip: &str, client_ip: &str, cfg: &Config) {
    let rule_name = format!("EDP-Block-RDP-{}", client_ip.replace('.', "-"));
    let ps = format!(
        "Remove-NetFirewallRule -DisplayName '{name}' -ErrorAction SilentlyContinue; Write-Output 'Desbloqueado-{ip}'",
        name = rule_name, ip = client_ip
    );
    let cmd = format!("powershell.exe -NonInteractive -Command \"{}\"", ps);
    let out = Command::new("wmic")
        .args([
            &format!("/node:{}", server_ip),
            &format!("/user:{}", cfg.rdp_user),
            &format!("/password:{}", cfg.rdp_password),
            "process", "call", "create", &cmd,
        ])
        .output();
    match out {
        Ok(_) => println!("[{}] IP {} desbloqueado em {} (acesso autorizado)", now(), client_ip, server_ip),
        Err(e) => println!("[{}] Desbloqueio {} em {} FALHOU: {}", now(), client_ip, server_ip, e),
    }
    // Aguardar que o PowerShell execute no servidor antes do mstsc ligar
    std::thread::sleep(std::time::Duration::from_secs(3));
}

fn limpar_bloqueios_firewall(server_ip: &str, cfg: &Config) {
    let ps = "Get-NetFirewallRule -DisplayName 'EDP-Block-RDP-*' -ErrorAction SilentlyContinue | Remove-NetFirewallRule; Write-Output 'Limpo'";
    let cmd = format!("powershell.exe -NonInteractive -Command \"{}\"", ps);
    let out = Command::new("wmic")
        .args([
            &format!("/node:{}", server_ip),
            &format!("/user:{}", cfg.rdp_user),
            &format!("/password:{}", cfg.rdp_password),
            "process", "call", "create", &cmd,
        ])
        .output();
    match out {
        Ok(_) => println!("[{}] Bloqueios anteriores removidos em {}", now(), server_ip),
        Err(e) => println!("[{}] Limpeza bloqueios em {} — {}", now(), server_ip, e),
    }
}

// Bloqueia IP do cliente no servidor via PowerShell (ativa firewall + adiciona regra)
// PowerShell é mais fiável que netsh direto e funciona mesmo se o firewall estava desativado
fn bloquear_ip_firewall(server_ip: &str, client_ip: &str, cfg: &Config) {
    let rule_name = format!("EDP-Block-RDP-{}", client_ip.replace('.', "-"));

    // Script PowerShell: ativa firewall em todos os perfis, remove regra antiga (se existir),
    // adiciona regra de bloqueio para o IP específico na porta 3389
    let ps = format!(
        "Set-NetFirewallProfile -All -Enabled True; \
         Remove-NetFirewallRule -DisplayName '{name}' -ErrorAction SilentlyContinue; \
         New-NetFirewallRule -DisplayName '{name}' -Direction Inbound \
           -LocalPort 3389 -Protocol TCP -Action Block -RemoteAddress {ip} -Profile Any -Enabled True | Out-Null; \
         Write-Output 'OK-{ip}'",
        name = rule_name, ip = client_ip
    );

    // Executar PowerShell no servidor remoto via wmic process call
    let cmd = format!("powershell.exe -NonInteractive -Command \"{}\"", ps);

    let out = Command::new("wmic")
        .args([
            &format!("/node:{}", server_ip),
            &format!("/user:{}", cfg.rdp_user),
            &format!("/password:{}", cfg.rdp_password),
            "process", "call", "create",
            &cmd,
        ])
        .output();

    match out {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            println!("[{}] Firewall block {} em {}: {}", now(), client_ip, server_ip,
                stdout.trim().lines().next().unwrap_or("iniciado"));
            // Aguardar 4s para o PowerShell executar no servidor antes do próximo poll
            std::thread::sleep(std::time::Duration::from_secs(4));
        }
        Err(e) => println!("[{}] Firewall block FALHOU {} em {}: {}", now(), client_ip, server_ip, e),
    }
}

// ── Eclusas & helpers ─────────────────────────────────────────────────────────

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
