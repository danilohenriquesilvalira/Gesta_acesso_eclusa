/// Ferramenta única de seeding — cria utilizadores de desenvolvimento no banco.
/// Uso: cargo run --bin seed
/// Não é parte do servidor — pode ser ignorado após execução.

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2,
};
use sqlx::PgPool;

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();
    let db_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL em falta no .env");

    let pool = PgPool::connect(&db_url).await
        .expect("Não foi possível ligar ao PostgreSQL");

    let utilizadores = [
        ("dev",  "12345678", "admin",    "Administrador Dev"),
        ("user", "12345678", "operator", "Utilizador Teste"),
    ];

    for (username, password, role, display) in &utilizadores {
        let p = password.to_string();
        let hash = tokio::task::spawn_blocking(move || {
            let salt = SaltString::generate(&mut OsRng);
            Argon2::default()
                .hash_password(p.as_bytes(), &salt)
                .map(|h| h.to_string())
                .ok()
        })
        .await
        .ok()
        .flatten()
        .expect("Erro ao gerar hash");

        match sqlx::query(
            "INSERT INTO users (username, password_hash, role, display_name, status) \
             VALUES ($1, $2, $3::user_role, $4, 'active'::user_status) \
             ON CONFLICT (username) DO UPDATE \
             SET password_hash = EXCLUDED.password_hash, \
                 role          = EXCLUDED.role, \
                 status        = 'active'::user_status"
        )
        .bind(username)
        .bind(&hash)
        .bind(role)
        .bind(display)
        .execute(&pool)
        .await
        {
            Ok(_) => println!("OK  {} / {} ({})", username, password, role),
            Err(e) => println!("ERR {}: {}", username, e),
        }
    }

    println!("\nPronto. Utilizadores no banco:");
    println!("  dev  / 12345678  →  admin");
    println!("  user / 12345678  →  operator");
}
