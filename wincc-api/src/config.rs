use std::time::Duration;

// ── Eclusas conhecidas ────────────────────────────────────────────────────────

#[allow(dead_code)]
pub const ECLUSA_IDS: [&str; 5] = ["CL", "CM", "PN", "RG", "VR"];

/// Caminho do ficheiro JSON de estado das eclusas.
/// Configurável via variável de ambiente ECLUSAS_FILE.
pub fn eclusas_file_path() -> String {
    std::env::var("ECLUSAS_FILE")
        .unwrap_or_else(|_| "/opt/next/data/eclusas.json".to_string())
}

// ── Timings ───────────────────────────────────────────────────────────────────

/// Intervalo entre polls RDP (ms) — baixo para resposta rápida ao dashboard
pub const RDP_POLL_MS:        u64 = 1_500;
/// Segundos sem penalizar acessos não registados após arranque
pub const STARTUP_GRACE_SECS: u64 = 30;
/// Expiração JWT
pub const JWT_EXPIRY_HOURS:   i64 = 8;
/// Conexões máximas ao PostgreSQL
pub const DB_POOL_MAX:        u32 = 25;
/// Timeout para adquirir conexão do pool (ms)
pub const DB_ACQUIRE_TIMEOUT_MS: u64 = 5_000;
/// Intervalo de heartbeat para PLCs (ms)
pub const PLC_HEARTBEAT_MS:   u64 = 1_000;
/// Falhas consecutivas antes de marcar PLC como degradado
pub const PLC_FAIL_DEGRADED:  u32 = 3;
/// Falhas consecutivas antes de marcar PLC como offline (dispara failover)
pub const PLC_FAIL_OFFLINE:   u32 = 5;
/// Timeout de ligação TCP ao PLC (ms)
pub const PLC_CONNECT_TIMEOUT_MS: u64 = 800;

// ── Config principal ──────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret:   String,
    pub rdp_user:     String,
    pub rdp_password: String,
    pub api_port:     String,
}

pub fn load_config() -> Config {
    let _ = dotenvy::dotenv();

    Config {
        database_url: require_env("DATABASE_URL"),
        jwt_secret:   require_env("JWT_SECRET"),
        rdp_user:     std::env::var("RDP_USER").unwrap_or_else(|_| "Administrator".into()),
        rdp_password: require_env("RDP_PASSWORD"),
        api_port:     std::env::var("API_PORT").unwrap_or_else(|_| "8080".into()),
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

impl RdpClient {
    #[allow(dead_code)]
    pub fn connect_timeout() -> Duration {
        Duration::from_millis(PLC_CONNECT_TIMEOUT_MS)
    }
}

pub fn load_rdp_clients() -> Vec<RdpClient> {
    vec![
        RdpClient {
            id: "cliente1".into(),
            ip: std::env::var("CLIENT1_IP").unwrap_or_else(|_| "172.29.164.49".into()),
        },
        RdpClient {
            id: "cliente2".into(),
            ip: std::env::var("CLIENT2_IP").unwrap_or_else(|_| "172.29.164.51".into()),
        },
    ]
}

// ── PLCs configurados ─────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct PlcConfig {
    pub id:          String,
    pub eclusa_code: String,
    pub ip:          String,
    pub port:        u16,
    #[allow(dead_code)]
    pub vlan_id:     u32,
}

/// PLCs conhecidos — IPs confirmados pelo cliente
pub fn load_plc_configs() -> Vec<PlcConfig> {
    vec![
        PlcConfig {
            id:          "PLC-PN".into(),
            eclusa_code: "PN".into(),
            ip:          std::env::var("PLC_PN_IP").unwrap_or_else(|_| "172.29.160.33".into()),
            port:        std::env::var("PLC_PN_PORT").ok()
                            .and_then(|p| p.parse().ok())
                            .unwrap_or(102),
            vlan_id:     30,
        },
        PlcConfig {
            id:          "PLC-RG".into(),
            eclusa_code: "RG".into(),
            ip:          std::env::var("PLC_RG_IP").unwrap_or_else(|_| "172.29.162.33".into()),
            port:        std::env::var("PLC_RG_PORT").ok()
                            .and_then(|p| p.parse().ok())
                            .unwrap_or(102),
            vlan_id:     40,
        },
        // CL, CM, VR — IPs a confirmar; serão carregados de .env quando disponíveis
        PlcConfig {
            id:          "PLC-CL".into(),
            eclusa_code: "CL".into(),
            ip:          std::env::var("PLC_CL_IP").unwrap_or_else(|_| "10.10.1.10".into()),
            port:        102,
            vlan_id:     10,
        },
        PlcConfig {
            id:          "PLC-CM".into(),
            eclusa_code: "CM".into(),
            ip:          std::env::var("PLC_CM_IP").unwrap_or_else(|_| "10.10.2.10".into()),
            port:        102,
            vlan_id:     20,
        },
        PlcConfig {
            id:          "PLC-VR".into(),
            eclusa_code: "VR".into(),
            ip:          std::env::var("PLC_VR_IP").unwrap_or_else(|_| "10.10.5.10".into()),
            port:        102,
            vlan_id:     50,
        },
    ]
}
