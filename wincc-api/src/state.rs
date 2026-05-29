use std::{collections::HashMap, sync::Arc, time::Instant};
use tokio::sync::{broadcast, RwLock};

use crate::{
    config::{load_rdp_clients, load_servidores, Config, RdpClient},
    types::{PlcHealthMap, RdpMap, ServidorHealth, ServidorHealthMap, Sessoes, Supervisoes},
};
use sqlx::PgPool;

// ── Inner mutable state — protected by RwLock ─────────────────────────────────
// Only things that change at runtime live here.
// Reads dominate (20+ viewers polling), writes are rare — RwLock is ideal.

#[derive(Debug, Default)]
pub struct AppStateInner {
    pub sessoes:     Sessoes,
    pub supervisoes: Supervisoes,
    pub rdp:         RdpMap,
    pub plc_health:  PlcHealthMap,
    pub operadores:  Vec<String>,
    #[allow(dead_code)]
    pub startup:     Option<Instant>,
    /// Estado das eclusas em memória — atualizado pelo WinCC via POST /eclusas/:id/estado.
    /// Persiste em disco em background; nunca lê do disco em runtime.
    pub eclusas:          serde_json::Value,
    pub servidor_health:  ServidorHealthMap,
}

// ── Outer AppState — database pool and channels are already thread-safe ────────

pub struct AppState {
    /// Mutable runtime state (sessions, rdp status, plc health, eclusas)
    pub inner:        RwLock<AppStateInner>,
    /// PostgreSQL connection pool — thread-safe, no lock needed
    pub db:           PgPool,
    /// SSE broadcast — sends full estado JSON to all connected dashboards
    pub sse_tx:       broadcast::Sender<String>,
    /// Per-client MJPEG frame channels
    pub frame_tx:     HashMap<String, broadcast::Sender<Vec<u8>>>,
    /// Static config loaded at startup
    pub cfg:          Config,
    /// RDP client list (id → ip), loaded once at startup
    pub rdp_clients:  Vec<RdpClient>,
    /// Servidores WinCC conhecidos (id → ip) — usados para firewall
    pub servidores:   Vec<RdpClient>,
    /// Force-logout map: username → unix timestamp — tokens issued before this are rejected
    pub force_logout: RwLock<HashMap<String, i64>>,
    /// In-memory JTI revocation cache: jti → expiry unix timestamp.
    /// Avoids DB query on every authenticated request for the common case.
    pub revoked_jtis: RwLock<HashMap<String, i64>>,
    /// Ultimo heartbeat recebido por cliente (wincc-agent instalado em cada Windows Server)
    pub heartbeats: RwLock<HashMap<String, Instant>>,
    /// IPs autorizados temporariamente para RDP admin direto (expiram em 10 min)
    /// Chave: "server_ip:client_ip", valor: Instant de quando foi autorizado
    pub admin_rdp: RwLock<HashMap<String, Instant>>,
    /// IP de failover ativo por cliente: "eclusa_RG" → "172.29.164.15"
    /// Quando presente, rdp_poll_loop monitoriza este IP em vez do IP principal.
    /// Limpo quando o servidor original volta online.
    pub failover_ips: RwLock<HashMap<String, String>>,
    /// Rate limiting para /auth/login: ip → (contagem, janela_inicio)
    /// Janela de 5 minutos, máx 10 tentativas. Limpo pelo cleanup_loop.
    pub login_attempts: RwLock<HashMap<String, (u32, std::time::Instant)>>,
    /// Token activo por username: username → (jti, iat unix timestamp)
    /// Registado no login, limpo no logout. Usado pelo session_expiry_watchdog.
    pub active_tokens: RwLock<HashMap<String, (String, i64)>>,
}

impl AppState {
    pub fn new(
        db:       PgPool,
        cfg:      Config,
        operadores: Vec<String>,
        eclusas:  serde_json::Value,
    ) -> Arc<Self> {
        let rdp_clients = load_rdp_clients();
        let servidores  = load_servidores();

        // Inicializa servidor_health com todos os servidores conhecidos (todos offline até heartbeat)
        let servidor_health: ServidorHealthMap = load_servidores()
            .into_iter()
            .map(|s| (s.id.clone(), ServidorHealth {
                servidor:         s.id.clone(),
                ip:               s.ip,
                windows_vivo:     false,
                wincc_vivo:       false,
                tela_atual:       String::new(),
                ultimo_heartbeat: String::new(),
                ultimo_wincc:     String::new(),
            }))
            .collect();

        let (sse_tx, _) = broadcast::channel::<String>(256);

        // MJPEG channels — one per client
        let mut frame_tx = HashMap::new();
        for c in &["cliente1", "cliente2", "cliente3", "cliente4", "cliente5"] {
            let (tx, _) = broadcast::channel::<Vec<u8>>(4);
            frame_tx.insert(c.to_string(), tx);
        }

        Arc::new(AppState {
            inner: RwLock::new(AppStateInner {
                operadores,
                startup: Some(Instant::now()),
                eclusas,
                servidor_health,
                ..Default::default()
            }),
            db,
            sse_tx,
            frame_tx,
            rdp_clients,
            servidores,
            cfg,
            force_logout:    RwLock::new(HashMap::new()),
            revoked_jtis:    RwLock::new(HashMap::new()),
            heartbeats:      RwLock::new(HashMap::new()),
            admin_rdp:       RwLock::new(HashMap::new()),
            failover_ips:    RwLock::new(HashMap::new()),
            login_attempts:  RwLock::new(HashMap::new()),
            active_tokens:   RwLock::new(HashMap::new()),
        })
    }

    /// Conveniência: obter IP de um cliente RDP por ID
    pub fn rdp_client_ip(&self, id: &str) -> Option<&str> {
        self.rdp_clients.iter()
            .find(|c| c.id == id)
            .map(|c| c.ip.as_str())
    }
}

/// Tipo compartilhado por todos os handlers e background tasks
pub type Shared = Arc<AppState>;
