use std::{
    io,
    net::{SocketAddr, TcpStream},
    time::Duration,
};

use crate::config::{PlcConfig, PLC_CONNECT_TIMEOUT_MS};

/// Probes a PLC by attempting a TCP connect on port 102 (S7 / ISO-on-TCP).
/// Must be called inside `tokio::task::spawn_blocking` — this is a blocking call.
pub fn probe_plc(cfg: &PlcConfig) -> io::Result<()> {
    let addr: SocketAddr = format!("{}:{}", cfg.ip, cfg.port)
        .parse()
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidInput, format!("endereço inválido: {}", e)))?;

    TcpStream::connect_timeout(&addr, Duration::from_millis(PLC_CONNECT_TIMEOUT_MS))?;
    Ok(())
}
