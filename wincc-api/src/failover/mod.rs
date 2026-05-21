pub mod orchestrator;

use std::collections::HashMap;
use tokio::time::{interval, Duration};

use crate::{
    config::PLC_HEARTBEAT_MS,
    state::Shared,
    types::PlcStatus,
};

/// Background FSM — monitoriza transições de plc_health e dispara acções de failover
/// quando um PLC fica Offline ou recupera para Online.
pub async fn failover_monitor_loop(state: Shared) {
    // true = failover activo para este PLC
    let mut active: HashMap<String, bool> = HashMap::new();

    // Verifica a cada 2× heartbeat — não precisa de competir com o health loop
    let mut tick = interval(Duration::from_millis(PLC_HEARTBEAT_MS * 2));
    tick.tick().await; // salta o primeiro tick

    loop {
        tick.tick().await;

        // Snapshot sob read lock — libertado imediatamente
        let snapshots: Vec<(String, String, PlcStatus)> = {
            let st = state.inner.read().await;
            st.plc_health
                .values()
                .map(|h| (h.id.clone(), h.eclusa_code.clone(), h.status.clone()))
                .collect()
        };

        for (id, eclusa_code, status) in snapshots {
            let was_active = active.get(&id).copied().unwrap_or(false);

            match (&status, was_active) {
                (PlcStatus::Offline, false) => {
                    tracing::error!(plc = %id, eclusa = %eclusa_code, "FAILOVER activado — PLC offline");
                    active.insert(id.clone(), true);
                    let s  = state.clone();
                    let p  = id.clone();
                    let ec = eclusa_code.clone();
                    tokio::spawn(async move {
                        orchestrator::trigger_failover(&s, &p, &ec).await;
                    });
                }

                (PlcStatus::Online, true) => {
                    tracing::info!(plc = %id, eclusa = %eclusa_code, "FAILOVER revertido — PLC recuperado");
                    active.insert(id.clone(), false);
                    let s  = state.clone();
                    let p  = id.clone();
                    let ec = eclusa_code.clone();
                    tokio::spawn(async move {
                        orchestrator::revert_failover(&s, &p, &ec).await;
                    });
                }

                _ => {}
            }
        }
    }
}
