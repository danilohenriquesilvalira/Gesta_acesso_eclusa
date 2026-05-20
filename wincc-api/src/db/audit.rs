use sqlx::PgPool;

/// Regista um evento de auditoria — async, await directamente em contextos async
pub async fn log_evento(db: &PgPool, event_type: &str, description: &str) {
    let _ = sqlx::query(
        "INSERT INTO audit_events (event_type, description) VALUES ($1, $2)"
    )
    .bind(event_type)
    .bind(description)
    .execute(db)
    .await;
}

/// Regista evento de auditoria fire-and-forget — para usar em contextos sync
/// ou quando não queremos aguardar a escrita (não bloqueia o handler)
pub fn log_evento_bg(db: &PgPool, event_type: &str, description: &str) {
    let db  = db.clone();
    let t   = event_type.to_string();
    let d   = description.to_string();
    tokio::spawn(async move { log_evento(&db, &t, &d).await; });
}

/// Regista evento com IP do utilizador
pub async fn log_evento_com_ip(
    db:         &PgPool,
    event_type: &str,
    description: &str,
    ip:         &str,
) {
    let _ = sqlx::query(
        "INSERT INTO audit_events (event_type, description, ip_address) \
         VALUES ($1, $2, $3::inet)"
    )
    .bind(event_type)
    .bind(description)
    .bind(ip)
    .execute(db)
    .await;
}
