use std::{collections::HashMap, sync::Arc, time::Instant};
use tokio::sync::{broadcast, RwLock};

use crate::{
    config::{load_rdp_clients, Config, RdpClient},
    types::{PlcHealthMap, RdpMap, Sessoes, Supervisoes, VmHealthMap},
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
    #[allow(dead_code)]
    pub vm_health:   VmHealthMap,
    pub operadores:  Vec<String>,
    pub startup:     Option<Instant>,
}

// ── Outer AppState — database pool and channels are already thread-safe ────────

pub struct AppState {
    /// Mutable runtime state (sessions, rdp status, plc health)
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
    /// Force-logout map: username → unix timestamp — tokens issued before this are rejected
    pub force_logout: RwLock<HashMap<String, i64>>,
}

impl AppState {
    pub fn new(db: PgPool, cfg: Config, operadores: Vec<String>) -> Arc<Self> {
        let rdp_clients = load_rdp_clients();

        let (sse_tx, _) = broadcast::channel::<String>(256);

        // MJPEG channels — one per client + room for future expansion
        let mut frame_tx = HashMap::new();
        for c in &["cliente1", "cliente2", "cliente3", "cliente4", "cliente5"] {
            let (tx, _) = broadcast::channel::<Vec<u8>>(4);
            frame_tx.insert(c.to_string(), tx);
        }

        Arc::new(AppState {
            inner: RwLock::new(AppStateInner {
                operadores,
                startup: Some(Instant::now()),
                ..Default::default()
            }),
            db,
            sse_tx,
            frame_tx,
            rdp_clients,
            cfg,
            force_logout: RwLock::new(HashMap::new()),
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
