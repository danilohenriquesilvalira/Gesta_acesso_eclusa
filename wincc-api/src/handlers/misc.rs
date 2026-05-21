use axum::{extract::State, Json};
use chrono::Utc;
use serde_json::Value;

use crate::{
    auth::{AdminUser, AuthUser},
    state::Shared,
    types::{now, OperadorReq},
};

/// GET /health — estado do serviço e da base de dados
pub async fn health(State(s): State<Shared>) -> Json<Value> {
    let db_ok    = sqlx::query("SELECT 1").fetch_one(&s.db).await.is_ok();
    let plc_ok   = {
        let st = s.inner.read().await;
        st.plc_health.values().all(|p| p.status == crate::types::PlcStatus::Online)
    };

    Json(serde_json::json!({
        "status":    if db_ok { "ok" } else { "degraded" },
        "db":        db_ok,
        "plc":       plc_ok,
        "timestamp": now()
    }))
}

// ── Operadores ────────────────────────────────────────────────────────────────

/// GET /operadores
pub async fn get_operadores(State(s): State<Shared>, _auth: AuthUser) -> Json<Value> {
    Json(serde_json::json!(s.inner.read().await.operadores))
}

/// POST /operadores — adiciona operador (admin only)
pub async fn add_operador(
    State(s):  State<Shared>,
    _admin:    AdminUser,
    Json(req): Json<OperadorReq>,
) -> Json<Value> {
    let nome = req.nome.trim().to_string();
    if nome.is_empty() {
        return Json(serde_json::json!({"ok": false, "erro": "Nome vazio"}));
    }

    // DB work ANTES do lock — ON CONFLICT é idempotente.
    // Write lock não deve ser segurado durante I/O assíncrono: bloquearia
    // todas as leituras de /estado dos 10 clientes pelo tempo da query (~5ms).
    if let Err(e) = sqlx::query(
        "INSERT INTO users (username, password_hash, role, display_name) \
         VALUES ($1, 'NEEDS_RESET', 'operator', $1) \
         ON CONFLICT (username) DO UPDATE SET role = 'operator'"
    )
    .bind(&nome)
    .execute(&s.db)
    .await
    {
        return Json(serde_json::json!({"ok": false, "erro": format!("BD: {}", e)}));
    }

    // Write lock apenas para actualizar a lista em memória — microsegundos.
    let mut st = s.inner.write().await;
    if st.operadores.iter().any(|o| o.eq_ignore_ascii_case(&nome)) {
        return Json(serde_json::json!({"ok": false, "erro": "Operador já existe"}));
    }
    st.operadores.push(nome.clone());
    st.operadores.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));

    Json(serde_json::json!({"ok": true}))
}

/// DELETE /operadores/:nome (admin only)
pub async fn del_operador(
    State(s):    State<Shared>,
    _admin:      AdminUser,
    axum::extract::Path(nome): axum::extract::Path<String>,
) -> Json<Value> {
    // Verificar que existe em memória antes de qualquer operação
    {
        let st = s.inner.read().await;
        if !st.operadores.iter().any(|o| o.eq_ignore_ascii_case(&nome)) {
            return Json(serde_json::json!({"ok": false, "erro": "Não encontrado"}));
        }
    }

    // Persistir desactivação na DB (preserva histórico, não aparece após restart)
    if let Err(e) = sqlx::query(
        "UPDATE users SET status = 'inactive'::user_status WHERE username = $1"
    )
    .bind(&nome)
    .execute(&s.db)
    .await
    {
        return Json(serde_json::json!({"ok": false, "erro": format!("BD: {}", e)}));
    }

    // Remove da lista em memória
    let mut st = s.inner.write().await;
    st.operadores.retain(|o| !o.eq_ignore_ascii_case(&nome));
    Json(serde_json::json!({"ok": true}))
}

// ── Logs de auditoria ─────────────────────────────────────────────────────────

/// GET /logs — últimos 500 eventos (requer auth)
pub async fn get_logs(State(s): State<Shared>, _auth: AuthUser) -> Json<Value> {
    let rows = sqlx::query(
        "SELECT id, event_type, description, ip_address::text, created_at \
         FROM audit_events ORDER BY created_at DESC LIMIT 500"
    )
    .fetch_all(&s.db)
    .await
    .unwrap_or_default();

    let logs: Vec<Value> = rows.iter().map(|r| serde_json::json!({
        "id":        sqlx::Row::try_get::<i64,_>(r, "id").unwrap_or(0),
        "tipo":      sqlx::Row::try_get::<String,_>(r, "event_type").unwrap_or_default(),
        "mensagem":  sqlx::Row::try_get::<Option<String>,_>(r, "description").ok().flatten().unwrap_or_default(),
        "ip":        sqlx::Row::try_get::<Option<String>,_>(r, "ip_address").ok().flatten(),
        "timestamp": sqlx::Row::try_get::<chrono::DateTime<Utc>,_>(r, "created_at")
                         .ok().map(|t| t.to_rfc3339()).unwrap_or_default(),
    })).collect();

    Json(serde_json::json!(logs))
}
