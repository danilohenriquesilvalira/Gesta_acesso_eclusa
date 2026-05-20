pub mod audit;

use tokio::time::{interval, Duration};

use sqlx::{postgres::PgPoolOptions, PgPool};
use std::time::Duration as StdDuration;

use crate::config::{DB_ACQUIRE_TIMEOUT_MS, DB_POOL_MAX};

pub async fn create_pool(database_url: &str) -> PgPool {
    PgPoolOptions::new()
        .max_connections(DB_POOL_MAX)
        .idle_timeout(StdDuration::from_secs(600))
        .max_lifetime(StdDuration::from_secs(1_800))
        .acquire_timeout(StdDuration::from_millis(DB_ACQUIRE_TIMEOUT_MS))
        .connect(database_url)
        .await
        .expect("Falha ao criar pool PostgreSQL — verifica DATABASE_URL em .env")
}

/// Verifica que o schema está aplicado (falha rápido no startup)
pub async fn verify_schema(pool: &PgPool) {
    sqlx::query("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await
        .expect("Schema PostgreSQL em falta — executa infra/db/schema.sql primeiro");
}


/// Carrega lista de operadores activos para memória (usado no arranque)
pub async fn load_operadores(pool: &PgPool) -> Vec<String> {
    sqlx::query_scalar::<_, String>(
        "SELECT username FROM users \
         WHERE role = 'operator'::user_role AND status = 'active'::user_status \
         ORDER BY username"
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default()
}

/// Se BOOTSTRAP_ADMIN_PASSWORD está definido e não existe nenhum admin activo,
/// cria automaticamente o utilizador 'admin' com essa senha.
/// Idealmente chamado uma vez no startup — é idempotente.
pub async fn bootstrap_admin_if_needed(pool: &PgPool) {
    let Ok(password) = std::env::var("BOOTSTRAP_ADMIN_PASSWORD") else { return; };
    if password.is_empty() { return; }

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM users \
         WHERE role = 'admin'::user_role AND status = 'active'::user_status"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(1); // em caso de erro, assume que já existe (seguro)

    if count > 0 { return; }

    let hash = tokio::task::spawn_blocking(move || {
        crate::auth::hash_password(&password).ok()
    })
    .await
    .ok()
    .flatten();

    let Some(hash) = hash else {
        eprintln!("[bootstrap] Erro ao gerar hash — admin não criado");
        return;
    };

    match sqlx::query(
        "INSERT INTO users (username, password_hash, role, display_name, status) \
         VALUES ('admin', $1, 'admin'::user_role, 'Administrador', 'active'::user_status) \
         ON CONFLICT (username) DO NOTHING"
    )
    .bind(&hash)
    .execute(pool)
    .await
    {
        Ok(_) => eprintln!("[bootstrap] Utilizador admin criado (BOOTSTRAP_ADMIN_PASSWORD)"),
        Err(e) => eprintln!("[bootstrap] Erro a criar admin: {}", e),
    }
}

/// Background task — limpa tokens revogados expirados e entradas antigas de force_logout.
/// Corre a cada hora. Sem esta limpeza a tabela cresceria indefinidamente.
pub async fn cleanup_loop(state: crate::state::Shared) {
    let mut tick = interval(Duration::from_secs(3_600)); // 1 hora
    tick.tick().await; // salta o primeiro tick imediato

    loop {
        tick.tick().await;

        // Remove tokens JWT já expirados da tabela de revogados
        match sqlx::query("DELETE FROM revoked_tokens WHERE expires_at < NOW()")
            .execute(&state.db)
            .await
        {
            Ok(r) if r.rows_affected() > 0 =>
                eprintln!("[cleanup] {} tokens expirados removidos", r.rows_affected()),
            Ok(_)  => {}
            Err(e) => eprintln!("[cleanup] Erro ao limpar revoked_tokens: {}", e),
        }

        // Remove entradas de force_logout com timestamp > 8h (JWT já expirado naturalmente)
        let threshold = chrono::Utc::now().timestamp() - (8 * 3600 + 60);
        let mut fl = state.force_logout.write().await;
        fl.retain(|_, ts| *ts > threshold);
    }
}
