pub mod orchestrator;

use std::collections::HashMap;
use tokio::time::{interval, Duration};

use crate::{
    config::{PLC_HEARTBEAT_MS},
    state::Shared,
    types::{now, PlcStatus},
};

/// Background FSM — watches plc_health for state transitions and triggers
/// orchestrator actions when a PLC goes Offline or recovers to Online.
pub async fn failover_monitor_loop(state: Shared) {
    // true = failover currently active for this PLC
    let mut active: HashMap<String, bool> = HashMap::new();

    // Check every 2 × heartbeat — no need to race the health loop
    let mut tick = interval(Duration::from_millis(PLC_HEARTBEAT_MS * 2));
    tick.tick().await; // skip first

    loop {
        tick.tick().await;

        // Read snapshot under read lock — release immediately
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
                // PLC just went offline — start failover
                (PlcStatus::Offline, false) => {
                    eprintln!("[{}] FAILOVER: {} (eclusa {}) OFFLINE", now(), id, eclusa_code);
                    active.insert(id.clone(), true);
                    let s  = state.clone();
                    let p  = id.clone();
                    let ec = eclusa_code.clone();
                    tokio::spawn(async move {
                        orchestrator::trigger_failover(&s, &p, &ec).await;
                    });
                }

                // PLC recovered — revert failover
                (PlcStatus::Online, true) => {
                    eprintln!("[{}] FAILOVER-REVERT: {} (eclusa {}) ONLINE", now(), id, eclusa_code);
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
