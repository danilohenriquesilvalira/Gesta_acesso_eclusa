use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    http::{request::Parts, StatusCode},
    Json,
};
use chrono::Utc;
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{config::JWT_EXPIRY_HOURS, state::Shared};

// ── JWT Claims ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub:  String,   // username
    pub role: String,   // admin | operator | supervisor
    pub jti:  String,   // UUID — permite revogação individual
    pub exp:  usize,
    pub iat:  usize,
}

pub fn make_token(username: &str, role: &str, secret: &str) -> Result<String, jsonwebtoken::errors::Error> {
    let now = Utc::now().timestamp() as usize;
    let claims = Claims {
        sub:  username.to_string(),
        role: role.to_string(),
        jti:  Uuid::new_v4().to_string(),
        iat:  now,
        exp:  now + (JWT_EXPIRY_HOURS as usize) * 3_600,
    };
    encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_bytes()))
}

pub fn verify_token(token: &str, secret: &str) -> Option<Claims> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .ok()
    .map(|d| d.claims)
}

// ── Password helpers ──────────────────────────────────────────────────────────

/// Hash argon2id — CPU-intensivo, chamar via spawn_blocking
pub fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
}

/// Verifica password contra hash argon2id — CPU-intensivo, chamar via spawn_blocking
pub fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .ok()
        .map(|ph| Argon2::default().verify_password(password.as_bytes(), &ph).is_ok())
        .unwrap_or(false)
}

// ── AuthUser extractor — valida JWT em qualquer request ──────────────────────

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub username: String,
    pub role:     String,
    pub jti:      String,
}

#[async_trait::async_trait]
impl axum::extract::FromRequestParts<Shared> for AuthUser {
    type Rejection = (StatusCode, Json<Value>);

    async fn from_request_parts(parts: &mut Parts, state: &Shared) -> Result<Self, Self::Rejection> {
        let token = extract_bearer(parts)
            .ok_or_else(|| unauthorized("Token em falta — use Authorization: Bearer <token>"))?;

        let claims = verify_token(token, &state.cfg.jwt_secret)
            .ok_or_else(|| unauthorized("Token inválido ou expirado"))?;

        // 1. Verificar cache em memória (caminho rápido — sem DB para 99% dos requests)
        {
            let cache = state.revoked_jtis.read().await;
            if let Some(&exp_ts) = cache.get(&claims.jti) {
                if Utc::now().timestamp() < exp_ts {
                    return Err(unauthorized("Sessão expirada — faça login novamente"));
                }
                // JTI expirou naturalmente — o cleanup ainda não limpou; deixar passar
            }
        }

        // 2. Fallback ao DB (cobre tokens revogados antes do último restart)
        let revoked: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM revoked_tokens WHERE jti = $1)"
        )
        .bind(&claims.jti)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false);

        if revoked {
            // Popular cache para evitar próximas queries ao DB
            let exp_ts = claims.exp as i64;
            let mut cache = state.revoked_jtis.write().await;
            cache.insert(claims.jti.clone(), exp_ts);
            return Err(unauthorized("Sessão expirada — faça login novamente"));
        }

        // 3. Verificar se admin forçou logout (todos os tokens antes deste timestamp são inválidos)
        let fl = state.force_logout.read().await;
        if let Some(&threshold) = fl.get(&claims.sub) {
            if (claims.iat as i64) <= threshold {
                return Err(unauthorized("Sessão encerrada pelo administrador"));
            }
        }
        drop(fl);

        Ok(AuthUser { username: claims.sub, role: claims.role, jti: claims.jti })
    }
}

// ── AdminUser extractor — apenas role=admin ───────────────────────────────────

#[derive(Debug, Clone)]
pub struct AdminUser(pub AuthUser);

#[async_trait::async_trait]
impl axum::extract::FromRequestParts<Shared> for AdminUser {
    type Rejection = (StatusCode, Json<Value>);

    async fn from_request_parts(parts: &mut Parts, state: &Shared) -> Result<Self, Self::Rejection> {
        let user = AuthUser::from_request_parts(parts, state).await?;
        if user.role != "admin" {
            return Err((
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({"ok": false, "erro": "Acesso negado — apenas administradores"})),
            ));
        }
        Ok(AdminUser(user))
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn extract_bearer<'a>(parts: &'a Parts) -> Option<&'a str> {
    parts.headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
}

fn unauthorized(msg: &str) -> (StatusCode, Json<Value>) {
    (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"ok": false, "erro": msg})))
}
