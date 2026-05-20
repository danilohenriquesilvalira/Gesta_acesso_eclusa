pub mod connection;
pub mod health;

use std::collections::HashMap;
use tokio::time::{interval, Duration};

use crate::{
    config::{load_plc_configs, PLC_FAIL_DEGRADED, PLC_FAIL_OFFLINE, PLC_HEARTBEAT_MS},
    state::Shared,
    types::{now, PlcHealth, PlcStatus},
};
use health::CircuitBreaker;

/// Background task — probes all 5 PLCs every PLC_HEARTBEAT_MS and updates plc_health.
/// Uses per-PLC circuit breakers: Online → Degraded after N fails → Offline after M fails.
pub async fn plc_health_loop(state: Shared) {
    let plc_configs = load_plc_configs();

    let breakers: HashMap<String, CircuitBreaker> = plc_configs
        .iter()
        .map(|c| (c.id.clone(), CircuitBreaker::new(PLC_FAIL_DEGRADED, PLC_FAIL_OFFLINE)))
        .collect();

    let mut tick = interval(Duration::from_millis(PLC_HEARTBEAT_MS));
    tick.tick().await; // skip the immediate first fire

    loop {
        tick.tick().await;

        // Probe all PLCs in parallel — each TCP connect in its own blocking thread
        let probes: Vec<_> = plc_configs
            .iter()
            .map(|cfg| {
                let cfg = cfg.clone();
                tokio::task::spawn_blocking(move || {
                    let ok = connection::probe_plc(&cfg).is_ok();
                    (cfg.id.clone(), cfg.ip.clone(), cfg.eclusa_code.clone(), ok)
                })
            })
            .collect();

        let results = futures::future::join_all(probes).await;

        // One write lock for the whole batch — minimises contention
        let mut st = state.inner.write().await;
        for (i, res) in results.into_iter().enumerate() {
            let (id, ip, eclusa_code, ok) = match res {
                Ok(r) => r,
                Err(_) => {
                    eprintln!("[{}] PLC probe task panicked (índice {})", now(), i);
                    continue;
                }
            };

            let breaker = match breakers.get(&id) {
                Some(b) => b,
                None    => continue,
            };

            let status = if ok {
                breaker.success();
                PlcStatus::Online
            } else {
                breaker.failure()
            };

            let prev_status = st.plc_health.get(&id).map(|h| h.status.clone());
            if prev_status.as_ref() != Some(&status) {
                eprintln!("[{}] PLC {} ({}): {:?}", now(), id, ip, status);
            }

            let consecutive_fails = if ok { 0 } else { breaker.fail_count() };

            st.plc_health.insert(id.clone(), PlcHealth {
                id:               id.clone(),
                eclusa_code,
                ip,
                status,
                consecutive_fails,
                last_check:       now(),
            });
        }
    }
}
