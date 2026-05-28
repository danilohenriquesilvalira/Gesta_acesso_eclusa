/// Caminho do ficheiro JSON de estado das eclusas.
/// Configurável via variável de ambiente ECLUSAS_FILE.
pub fn eclusas_file_path() -> String {
    std::env::var("ECLUSAS_FILE")
        .unwrap_or_else(|_| "/opt/next/data/eclusas.json".to_string())
}

// ── Timings ───────────────────────────────────────────────────────────────────

/// Intervalo entre polls RDP (ms)
pub const RDP_POLL_MS:            u64 = 500;
/// Segundos de graça após arranque antes de penalizar acessos não registados
#[allow(dead_code)]
pub const STARTUP_GRACE_SECS:     u64 = 30;
/// Expiração JWT em horas
pub const JWT_EXPIRY_HOURS:       i64 = 24;
/// Conexões máximas ao PostgreSQL
pub const DB_POOL_MAX:            u32 = 25;
/// Timeout para adquirir conexão do pool (ms)
pub const DB_ACQUIRE_TIMEOUT_MS:  u64 = 5_000;
/// Intervalo de heartbeat para PLCs (ms)
pub const PLC_HEARTBEAT_MS:       u64 = 1_000;

// ── Config principal ──────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url:   String,
    pub jwt_secret:     String,
    pub rdp_user:       String,
    pub rdp_password:   String,
    pub api_port:       String,
    /// Origens permitidas no CORS, separadas por vírgula.
    /// Ex: "http://172.29.164.10:1420,http://172.29.164.11:1420"
    /// Se não definido, permite apenas 127.0.0.1 (seguro por defeito).
    pub allowed_origins: Vec<String>,
    #[allow(dead_code)] pub ssh_key_path: String,
    #[allow(dead_code)] pub ssh_port:     u16,
    #[allow(dead_code)] pub reserva_ip:   String,
    pub agent_secret: Option<String>,
}

pub fn load_config() -> Config {
    let _ = dotenvy::dotenv();

    let allowed_origins = std::env::var("ALLOWED_ORIGINS")
        .unwrap_or_else(|_| "http://localhost:1420,http://127.0.0.1:1420,tauri://localhost".into())
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    Config {
        database_url:   require_env("DATABASE_URL"),
        jwt_secret:     require_env("JWT_SECRET"),
        rdp_user:       std::env::var("RDP_USER").unwrap_or_else(|_| "Administrator".into()),
        rdp_password:   require_env("RDP_PASSWORD"),
        api_port:       std::env::var("API_PORT").unwrap_or_else(|_| "8080".into()),
        allowed_origins,
        ssh_key_path:   std::env::var("SSH_KEY_PATH")
                            .unwrap_or_else(|_| "/etc/wincc-api/ssh_key".into()),
        ssh_port:       std::env::var("SSH_PORT").ok()
                            .and_then(|p| p.parse().ok())
                            .unwrap_or(22),
        reserva_ip:     std::env::var("RESERVA_IP")
                            .unwrap_or_else(|_| "172.29.164.15".into()),
        agent_secret:   std::env::var("AGENT_SECRET").ok(),
    }
}

fn require_env(key: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| panic!("{} deve estar definido em .env", key))
}

// ── Clientes RDP — pares (id, ip) ─────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct RdpClient {
    pub id: String,
    pub ip: String,
}

pub fn load_rdp_clients() -> Vec<RdpClient> {
    vec![
        RdpClient {
            id: "eclusa_RG".into(),
            ip: std::env::var("SRV_RG_IP").unwrap_or_else(|_| "172.29.164.13".into()),
        },
        RdpClient {
            id: "eclusa_PN".into(),
            ip: std::env::var("SRV_PN_IP").unwrap_or_else(|_| "172.29.164.14".into()),
        },
    ]
}


/// Servidores Windows conhecidos — cada um corre wincc-agent.
/// IDs coincidem com o campo "servidor" no config.json do agente.
pub fn load_servidores() -> Vec<RdpClient> {
    vec![
        RdpClient { id: "RG".into(),       ip: std::env::var("SRV_RG_IP").unwrap_or_else(|_| "172.29.164.13".into()) },
        RdpClient { id: "PN".into(),       ip: std::env::var("SRV_PN_IP").unwrap_or_else(|_| "172.29.164.14".into()) },
        RdpClient { id: "Reserva01".into(),ip: std::env::var("SRV_R1_IP").unwrap_or_else(|_| "172.29.164.15".into()) },
        RdpClient { id: "Reserva02".into(),ip: std::env::var("SRV_R2_IP").unwrap_or_else(|_| "172.29.164.16".into()) },
        RdpClient { id: "Reserva03".into(),ip: std::env::var("SRV_R3_IP").unwrap_or_else(|_| "172.29.164.17".into()) },
        RdpClient { id: "CL".into(),       ip: std::env::var("SRV_CL_IP").unwrap_or_else(|_| "172.29.164.18".into()) },
        RdpClient { id: "CM".into(),       ip: std::env::var("SRV_CM_IP").unwrap_or_else(|_| "172.29.164.19".into()) },
        RdpClient { id: "VR".into(),       ip: std::env::var("SRV_VR_IP").unwrap_or_else(|_| "172.29.164.20".into()) },
    ]
}

