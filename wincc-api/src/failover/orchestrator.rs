use crate::{state::Shared, types::now};

/// Triggers failover for a PLC that has gone offline.
///
/// Phase 2 implementation will:
///   1. Identify which WinCC VM controls the fallen PLC
///   2. Reconfigure WinCC TCP connection to cluster IP via API
///   3. Redirect the RDP client connected to that VM to the cluster VM
///   4. Broadcast SSE event so all dashboards show the failover alert
pub async fn trigger_failover(_state: &Shared, plc_id: &str, eclusa_code: &str) {
    eprintln!(
        "[{}] FAILOVER ACTIVADO: PLC {} (eclusa {}) — redirecionamento pendente (fase 2)",
        now(), plc_id, eclusa_code
    );
    // TODO fase 2: implementar redirecionamento WinCC + RDP
}

/// Reverts a previous failover once the original PLC comes back online.
pub async fn revert_failover(_state: &Shared, plc_id: &str, eclusa_code: &str) {
    eprintln!(
        "[{}] FAILOVER REVERTIDO: PLC {} (eclusa {}) recuperado — revert pendente (fase 2)",
        now(), plc_id, eclusa_code
    );
    // TODO fase 2: restaurar ligação WinCC original + RDP original
}
