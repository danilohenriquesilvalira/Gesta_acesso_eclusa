use std::sync::atomic::{AtomicU32, Ordering};

use crate::types::PlcStatus;

/// Per-PLC circuit breaker — tracks consecutive failures and derives status.
/// All methods use Relaxed ordering: eventual consistency is sufficient here.
pub struct CircuitBreaker {
    fails:       AtomicU32,
    degraded_at: u32,
    offline_at:  u32,
}

impl CircuitBreaker {
    pub fn new(degraded_at: u32, offline_at: u32) -> Self {
        Self { fails: AtomicU32::new(0), degraded_at, offline_at }
    }

    pub fn success(&self) {
        self.fails.store(0, Ordering::Relaxed);
    }

    pub fn failure(&self) -> PlcStatus {
        let n = self.fails.fetch_add(1, Ordering::Relaxed) + 1;
        self.classify(n)
    }

    pub fn fail_count(&self) -> u32 {
        self.fails.load(Ordering::Relaxed)
    }

    fn classify(&self, n: u32) -> PlcStatus {
        if n >= self.offline_at       { PlcStatus::Offline }
        else if n >= self.degraded_at { PlcStatus::Degraded }
        else                          { PlcStatus::Online }
    }
}
