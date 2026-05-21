use axum::{
    body::Bytes,
    extract::{Path, State, WebSocketUpgrade},
    http::StatusCode,
    response::IntoResponse,
};
use axum::extract::ws::{Message, WebSocket};
use std::convert::Infallible;
use tokio::sync::broadcast;
use tokio_stream::{wrappers::BroadcastStream, StreamExt as _};

use crate::state::Shared;

/// POST /stream/:cliente/frame — WinCC Streamer envia JPEG frames aqui (sem auth — LAN)
pub async fn post_frame(
    Path(cliente): Path<String>,
    State(s):      State<Shared>,
    body:          Bytes,
) -> StatusCode {
    if body.is_empty() { return StatusCode::BAD_REQUEST; }

    if let Some(tx) = s.frame_tx.get(&cliente) {
        // Se não há viewers, broadcast::error::SendError é ignorado correctamente
        let _ = tx.send(body.to_vec());
    }
    StatusCode::OK
}

/// GET /stream/:cliente/mjpeg — streaming MJPEG para browsers/Tauri webview
pub async fn get_mjpeg(
    Path(cliente): Path<String>,
    State(s):      State<Shared>,
) -> axum::response::Response {
    let rx = match s.frame_tx.get(&cliente) {
        Some(tx) => tx.subscribe(),
        None     => return StatusCode::NOT_FOUND.into_response(),
    };

    let stream = BroadcastStream::new(rx).filter_map(|r| {
        // Descarta frames atrasados (Lagged) sem erro — viewer estava lento
        let frame = r.ok()?;
        let header = format!(
            "--mjpeg\r\nContent-Type: image/jpeg\r\nContent-Length: {}\r\n\r\n",
            frame.len()
        );
        let mut data = header.into_bytes();
        data.extend_from_slice(&frame);
        data.extend_from_slice(b"\r\n");
        Some(Ok::<Bytes, Infallible>(Bytes::from(data)))
    });

    axum::response::Response::builder()
        .header("Content-Type", "multipart/x-mixed-replace; boundary=mjpeg")
        .header("Cache-Control", "no-cache, no-store, must-revalidate")
        .header("Access-Control-Allow-Origin", "*")
        .body(axum::body::Body::from_stream(stream))
        .unwrap()
}

/// GET /stream/:cliente/ws — WebSocket para latência mínima (Tauri usa este)
pub async fn ws_viewer(
    ws:            WebSocketUpgrade,
    Path(cliente): Path<String>,
    State(s):      State<Shared>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws(socket, cliente, s))
}

async fn handle_ws(mut socket: WebSocket, cliente: String, s: Shared) {
    let mut rx = match s.frame_tx.get(&cliente) {
        Some(tx) => tx.subscribe(),
        None     => return,
    };

    loop {
        match rx.recv().await {
            Ok(frame) => {
                if socket.send(Message::Binary(frame)).await.is_err() { break; }
            }
            // Viewer estava lento — descarta frames perdidos e continua
            Err(broadcast::error::RecvError::Lagged(_)) => continue,
            Err(broadcast::error::RecvError::Closed)    => break,
        }
    }
}
