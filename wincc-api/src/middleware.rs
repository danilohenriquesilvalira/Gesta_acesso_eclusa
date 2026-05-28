use axum::{
    body::Body,
    extract::ConnectInfo,
    http::{Request, StatusCode},
    middleware::Next,
    response::Response,
};
use std::net::{IpAddr, SocketAddr};

/// Middleware: rejeita pedidos de IPs fora da sub-rede permitida.
///
/// Aplica-se apenas aos endpoints "LAN only" (sem JWT):
///   /stream/*, /eclusas/:id/estado, /plc/dados, /heartbeat/*, /wincc-status/*
///
/// A sub-rede permitida é 172.29.0.0/16 — cobre todos os IPs do projecto
/// (servidores WinCC, PLCs, clientes Tauri, Node-RED, wincc-agent).
/// Loopback (127.0.0.1, ::1) é sempre permitido para health checks internos.
pub async fn apenas_lan(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    req: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let ip = addr.ip();

    if ip_permitido(&ip) {
        Ok(next.run(req).await)
    } else {
        tracing::warn!(ip = %ip, path = %req.uri().path(), "Pedido bloqueado: IP fora da LAN");
        Err(StatusCode::FORBIDDEN)
    }
}

fn ip_permitido(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let octets = v4.octets();
            // 127.0.0.0/8 — loopback
            if octets[0] == 127 { return true; }
            // 172.29.0.0/16 — rede EDP (todos os servidores, PLCs, clientes)
            if octets[0] == 172 && octets[1] == 29 { return true; }
            // 10.10.0.0/16 — sub-rede alternativa PLCs (CL, CM, VR)
            if octets[0] == 10 && octets[1] == 10 { return true; }
            false
        }
        IpAddr::V6(v6) => {
            // ::1 — loopback IPv6
            v6.is_loopback()
        }
    }
}
