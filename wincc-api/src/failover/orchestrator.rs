use crate::state::Shared;

/// Dispara failover para um PLC que ficou offline.
///
/// Fase 2 irá:
///   1. Identificar qual VM WinCC controla o PLC em falha
///   2. Reconfigurar a ligação TCP WinCC para o IP do cluster via API
///   3. Redirecionar o cliente RDP ligado a essa VM para a VM de cluster
///   4. Broadcast SSE para todos os dashboards mostrarem o alerta de failover
pub async fn trigger_failover(_state: &Shared, plc_id: &str, eclusa_code: &str) {
    tracing::warn!(
        plc = %plc_id,
        eclusa = %eclusa_code,
        "Failover activado — redirecionamento WinCC+RDP pendente (fase 2)"
    );
    // TODO fase 2: implementar redirecionamento WinCC + RDP
}

/// Reverte um failover anterior quando o PLC original recupera.
pub async fn revert_failover(_state: &Shared, plc_id: &str, eclusa_code: &str) {
    tracing::info!(
        plc = %plc_id,
        eclusa = %eclusa_code,
        "Failover revertido — restaurar ligação WinCC+RDP original pendente (fase 2)"
    );
    // TODO fase 2: restaurar ligação WinCC original + RDP original
}
