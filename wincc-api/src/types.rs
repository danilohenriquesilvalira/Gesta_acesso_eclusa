use chrono::Local;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── Helpers ───────────────────────────────────────────────────────────────────

#[inline]
pub fn now() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

// ── Domínio — Sessões & Supervisão ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Sessao {
    pub operador:         String,
    pub timestamp_inicio: String,
    pub conectado:        bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Sessoes {
    pub cliente1: Sessao,
    pub cliente2: Sessao,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Supervisao {
    pub supervisor: String,
    pub timestamp:  String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Supervisoes {
    pub cliente1: Vec<Supervisao>,
    pub cliente2: Vec<Supervisao>,
}

// ── RDP State ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Default)]
pub struct RdpInfo {
    pub ocupado:        bool,
    pub utilizador:     String,
    pub verificado:     bool,
    pub timestamp:      String,
    pub nao_autorizado: bool,
    #[serde(skip)] pub nome_sessao: String,
    #[serde(skip)] pub sessao_id:   Option<u32>,
}

pub type RdpMap = HashMap<String, RdpInfo>;

// ── PLC Health ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum PlcStatus {
    #[default] Online,
    Degraded,
    Offline,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct PlcHealth {
    pub id:          String,
    pub eclusa_code: String,
    pub ip:          String,
    pub status:      PlcStatus,
    pub consecutive_fails: u32,
    pub last_check:  String,
}

pub type PlcHealthMap = HashMap<String, PlcHealth>;

// ── WinCC VM Health ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum VmStatus {
    #[default] Online,
    Degraded,
    Offline,
    Maintenance,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct VmHealth {
    pub id:               i32,
    pub name:             String,
    pub eclusa_code:      Option<String>,
    pub status:           VmStatus,
    pub consecutive_fails: u32,
}

pub type VmHealthMap = HashMap<i32, VmHealth>;

// ── Constantes eclusa status (escritas pelo WinCC via API) ────────────────────

#[allow(dead_code)]
pub mod eclusa_status {
    pub const LIVRE:          i32 = 0;
    pub const OPERACAO_LOCAL: i32 = 1;
    pub const TELECOMANDO:    i32 = 2;
}

// ── Request bodies ────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct IniciarReq {
    pub cliente:  String,
    pub operador: String,
}

#[derive(Debug, Deserialize)]
pub struct EncerrarReq {
    pub cliente: String,
}

#[derive(Debug, Deserialize)]
pub struct SupervisaoReq {
    pub cliente:    String,
    pub supervisor: String,
}

#[derive(Debug, Deserialize)]
pub struct EncerrarSupervisaoReq {
    pub cliente:    String,
    pub supervisor: String,
}

#[derive(Debug, Deserialize)]
pub struct OperadorReq {
    pub nome: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginReq {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserReq {
    pub username:     String,
    pub password:     String,
    pub role:         Option<String>,
    pub display_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserReq {
    pub display_name:    Option<String>,
    pub role:            Option<String>,
    pub status:          Option<String>,
    pub blocked_reason:  Option<String>,
    #[allow(dead_code)]
    pub allowed_eclusas: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct BlacklistReq {
    pub ip:     String,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ForceLogoutReq {
    pub username: String,
}

#[derive(Debug, Deserialize)]
pub struct EclusaEstadoReq {
    pub status:  i32,
    pub modo:    String,
    pub posto:   String,
    pub usuario: String,
}
