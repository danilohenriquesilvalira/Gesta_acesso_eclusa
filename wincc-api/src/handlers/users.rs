use axum::{
    extract::{ConnectInfo, Path, State},
    Json,
};
use chrono::Utc;
use serde_json::Value;
use std::net::SocketAddr;

use crate::{
    auth::{hash_password, make_token, verify_password, AdminUser, AuthUser},
    db::audit::{log_evento, log_evento_bg, log_evento_com_ip},
    rdp::broadcast_estado,
    state::Shared,
    types::{BlacklistReq, CreateUserReq, ForceLogoutReq, LoginReq, UpdateUserReq},
};

// ── Auth ──────────────────────────────────────────────────────────────────────

/// POST /auth/login — autentica e devolve JWT
pub async fn auth_login(
    State(s):          State<Shared>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(req):         Json<LoginReq>,
) -> Json<Value> {
    let username  = req.username.trim().to_lowercase();
    let caller_ip = addr.ip().to_string();

    // Verificar IP não bloqueado
    let ip_blocked: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM ip_blacklist \
         WHERE ip = $1::inet AND active = TRUE \
         AND (expires_at IS NULL OR expires_at > NOW()))"
    )
    .bind(&caller_ip)
    .fetch_one(&s.db)
    .await
    .unwrap_or(false);

    if ip_blocked {
        return Json(serde_json::json!({"ok": false, "erro": "IP bloqueado"}));
    }

    // Buscar utilizador no PostgreSQL — cast explícito dos enums para text
    let row = sqlx::query(
        "SELECT password_hash, role::text AS role, status::text AS status FROM users WHERE username = $1"
    )
    .bind(&username)
    .fetch_optional(&s.db)
    .await
    .ok()
    .flatten();

    let row = match row {
        Some(r) => r,
        None => {
            log_evento_bg(&s.db, "login_falhou",
                &format!("Utilizador '{}' não encontrado (IP: {})", username, caller_ip));
            // Mesmo tempo de resposta que password errada (evita enumeração)
            return Json(serde_json::json!({"ok": false, "erro": "Credenciais inválidas"}));
        }
    };

    let hash:   String = sqlx::Row::try_get(&row, "password_hash").unwrap_or_default();
    let role:   String = sqlx::Row::try_get(&row, "role").unwrap_or_default();
    let status: String = sqlx::Row::try_get(&row, "status").unwrap_or_default();

    if status != "active" {
        log_evento_bg(&s.db, "login_falhou",
            &format!("Conta bloqueada/inactiva: '{}' (IP: {})", username, caller_ip));
        return Json(serde_json::json!({"ok": false, "erro": "Conta bloqueada ou inactiva"}));
    }

    // Verificar password — argon2id, CPU-intensivo → spawn_blocking
    let password = req.password.clone();
    let hash_cmp = hash.clone();
    let valid = tokio::task::spawn_blocking(move || verify_password(&password, &hash_cmp))
        .await
        .unwrap_or(false);

    if !valid {
        log_evento_bg(&s.db, "login_falhou",
            &format!("Password errada: '{}' (IP: {})", username, caller_ip));
        return Json(serde_json::json!({"ok": false, "erro": "Credenciais inválidas"}));
    }

    // Gerar JWT
    let token = match make_token(&username, &role, &s.cfg.jwt_secret) {
        Ok(t)  => t,
        Err(e) => return Json(serde_json::json!({"ok": false, "erro": format!("Erro JWT: {}", e)})),
    };

    // Actualizar last_login e audit log em background
    let db   = s.db.clone();
    let user = username.clone();
    let ip   = caller_ip.clone();
    tokio::spawn(async move {
        let _ = sqlx::query("UPDATE users SET last_login = NOW() WHERE username = $1")
            .bind(&user).execute(&db).await;
        log_evento_com_ip(&db, "login_ok",
            &format!("Autenticação bem-sucedida: utilizador '{}'", user), &ip).await;
    });

    Json(serde_json::json!({
        "ok":       true,
        "token":    token,
        "role":     role,
        "username": username,
    }))
}

/// POST /auth/logout — revoga token JWT (pode ser chamado com qualquer token válido)
pub async fn auth_logout(State(s): State<Shared>, auth: AuthUser) -> Json<Value> {
    // Inserir JTI na tabela de tokens revogados
    let exp = Utc::now() + chrono::Duration::hours(crate::config::JWT_EXPIRY_HOURS);
    let _ = sqlx::query(
        "INSERT INTO revoked_tokens (jti, user_id, expires_at) \
         VALUES ($1, (SELECT id FROM users WHERE username = $2), $3) \
         ON CONFLICT (jti) DO NOTHING"
    )
    .bind(&auth.jti)
    .bind(&auth.username)
    .bind(exp)
    .execute(&s.db)
    .await;

    log_evento_bg(&s.db, "logout", &format!("Sessão terminada: utilizador '{}'", auth.username));
    Json(serde_json::json!({"ok": true}))
}

// ── User CRUD ─────────────────────────────────────────────────────────────────

/// GET /usuarios — lista utilizadores (admin only), enriquecida com sessão activa
pub async fn list_usuarios(State(s): State<Shared>, _admin: AdminUser) -> Json<Value> {
    let rows = sqlx::query(
        "SELECT username, display_name, role::text AS role, status::text AS status, last_login, created_at \
         FROM users ORDER BY username"
    )
    .fetch_all(&s.db)
    .await
    .unwrap_or_default();

    // Sessões activas em memória — read lock curto
    let (op_c1, op_c2) = {
        let st = s.inner.read().await;
        (
            if st.sessoes.cliente1.conectado { st.sessoes.cliente1.operador.to_lowercase() } else { String::new() },
            if st.sessoes.cliente2.conectado { st.sessoes.cliente2.operador.to_lowercase() } else { String::new() },
        )
    };

    let users: Vec<Value> = rows.iter().map(|r| {
        let uname: String = sqlx::Row::try_get(r, "username").unwrap_or_default();
        let (sessao_ativa, cliente_ativo) = if !op_c1.is_empty() && op_c1 == uname.to_lowercase() {
            (true, Some("cliente1"))
        } else if !op_c2.is_empty() && op_c2 == uname.to_lowercase() {
            (true, Some("cliente2"))
        } else {
            (false, None)
        };
        serde_json::json!({
            "username":     uname,
            "display_name": sqlx::Row::try_get::<Option<String>,_>(r, "display_name").ok().flatten(),
            "role":         sqlx::Row::try_get::<String,_>(r, "role").unwrap_or_default(),
            "status":       sqlx::Row::try_get::<String,_>(r, "status").unwrap_or_default(),
            "last_login":   sqlx::Row::try_get::<Option<chrono::DateTime<Utc>>,_>(r, "last_login")
                                .ok().flatten().map(|t| t.to_rfc3339()),
            "created_at":   sqlx::Row::try_get::<chrono::DateTime<Utc>,_>(r, "created_at")
                                .ok().map(|t| t.to_rfc3339()),
            "sessao_ativa":  sessao_ativa,
            "cliente_ativo": cliente_ativo,
        })
    }).collect();

    Json(serde_json::json!(users))
}

/// GET /usuarios/:username
pub async fn get_usuario(
    State(s):       State<Shared>,
    _admin:         AdminUser,
    Path(username): Path<String>,
) -> Json<Value> {
    let row = sqlx::query(
        "SELECT username, display_name, role::text AS role, status::text AS status, last_login, created_at \
         FROM users WHERE username = $1"
    )
    .bind(&username)
    .fetch_optional(&s.db)
    .await
    .ok()
    .flatten();

    match row {
        Some(r) => Json(serde_json::json!({
            "username":     sqlx::Row::try_get::<String,_>(&r, "username").unwrap_or_default(),
            "display_name": sqlx::Row::try_get::<Option<String>,_>(&r, "display_name").ok().flatten(),
            "role":         sqlx::Row::try_get::<String,_>(&r, "role").unwrap_or_default(),
            "status":       sqlx::Row::try_get::<String,_>(&r, "status").unwrap_or_default(),
        })),
        None => Json(serde_json::json!({"ok": false, "erro": "Utilizador não encontrado"})),
    }
}

/// POST /usuarios — cria novo utilizador (admin only)
pub async fn create_usuario(
    State(s):  State<Shared>,
    admin:     AdminUser,
    Json(req): Json<CreateUserReq>,
) -> Json<Value> {
    let username = req.username.trim().to_lowercase();
    if username.is_empty() {
        return Json(serde_json::json!({"ok": false, "erro": "Username vazio"}));
    }
    if req.password.len() < 8 {
        return Json(serde_json::json!({"ok": false, "erro": "Password mínimo 8 caracteres"}));
    }
    let role = req.role.as_deref().unwrap_or("operator").to_string();
    if !["admin", "operator", "supervisor"].contains(&role.as_str()) {
        return Json(serde_json::json!({"ok": false, "erro": "Role inválido"}));
    }

    // Hash argon2id em blocking thread
    let password = req.password.clone();
    let hash = match tokio::task::spawn_blocking(move || hash_password(&password)).await {
        Ok(Ok(h))  => h,
        Ok(Err(e)) => return Json(serde_json::json!({"ok": false, "erro": format!("Hash: {}", e)})),
        Err(_)     => return Json(serde_json::json!({"ok": false, "erro": "Erro interno"})),
    };

    let display = req.display_name.as_deref().unwrap_or(&username).to_string();
    match sqlx::query(
        "INSERT INTO users (username, password_hash, role, display_name) VALUES ($1, $2, $3::user_role, $4)"
    )
    .bind(&username).bind(&hash).bind(&role).bind(&display)
    .execute(&s.db)
    .await
    {
        Ok(_) => {
            let db  = s.db.clone();
            let papel = match role.as_str() {
                "admin"      => "Administrador",
                "operator"   => "Operador",
                "supervisor" => "Supervisor",
                _            => &role,
            };
            let msg = format!(
                "Novo utilizador criado: '{}' com papel '{}' — por '{}'",
                username, papel, admin.0.username
            );
            tokio::spawn(async move { log_evento(&db, "user_criado", &msg).await; });
            Json(serde_json::json!({"ok": true}))
        }
        Err(e) if e.to_string().contains("unique") =>
            Json(serde_json::json!({"ok": false, "erro": "Username já existe"})),
        Err(e) =>
            Json(serde_json::json!({"ok": false, "erro": format!("Erro DB: {}", e)})),
    }
}

/// PUT /usuarios/:username — actualiza campos do utilizador (admin only)
pub async fn update_usuario(
    State(s):       State<Shared>,
    admin:          AdminUser,
    Path(username): Path<String>,
    Json(req):      Json<UpdateUserReq>,
) -> Json<Value> {
    if username == admin.0.username && req.status.as_deref() == Some("blocked") {
        return Json(serde_json::json!({"ok": false, "erro": "Não pode bloquear a própria conta"}));
    }
    if let Some(ref r) = req.role {
        if !["admin", "operator", "supervisor"].contains(&r.as_str()) {
            return Json(serde_json::json!({"ok": false, "erro": "Role inválido"}));
        }
    }
    if let Some(ref s_str) = req.status {
        if !["active", "blocked", "inactive"].contains(&s_str.as_str()) {
            return Json(serde_json::json!({"ok": false, "erro": "Status inválido"}));
        }
    }

    let no_changes = req.display_name.is_none() && req.role.is_none()
        && req.status.is_none() && req.blocked_reason.is_none();
    if no_changes {
        return Json(serde_json::json!({"ok": false, "erro": "Nenhum campo para actualizar"}));
    }

    if let Some(ref v) = req.display_name {
        let _ = sqlx::query("UPDATE users SET display_name = $1 WHERE username = $2")
            .bind(v).bind(&username).execute(&s.db).await;
    }
    if let Some(ref v) = req.role {
        let _ = sqlx::query("UPDATE users SET role = $1::user_role WHERE username = $2")
            .bind(v).bind(&username).execute(&s.db).await;
    }
    if let Some(ref v) = req.status {
        let _ = sqlx::query("UPDATE users SET status = $1::user_status WHERE username = $2")
            .bind(v).bind(&username).execute(&s.db).await;
        if v == "blocked" {
            let blocker: Option<uuid::Uuid> = sqlx::query_scalar(
                "SELECT id FROM users WHERE username = $1"
            ).bind(&admin.0.username).fetch_optional(&s.db).await.ok().flatten();
            let _ = sqlx::query(
                "UPDATE users SET blocked_at = NOW(), blocked_by = $1 WHERE username = $2"
            ).bind(blocker).bind(&username).execute(&s.db).await;
        }
    }
    if let Some(ref v) = req.blocked_reason {
        let _ = sqlx::query("UPDATE users SET blocked_reason = $1 WHERE username = $2")
            .bind(v).bind(&username).execute(&s.db).await;
    }

    // Mensagem de auditoria detalhada conforme o que foi alterado
    let mut acoes: Vec<String> = Vec::new();
    if let Some(ref v) = req.status {
        let descricao = match v.as_str() {
            "blocked"  => "conta bloqueada",
            "active"   => "conta reactivada",
            "inactive" => "conta desactivada",
            _          => "estado alterado",
        };
        acoes.push(descricao.to_string());
    }
    if let Some(ref v) = req.role {
        let papel = match v.as_str() {
            "admin"      => "Administrador",
            "operator"   => "Operador",
            "supervisor" => "Supervisor",
            _            => v.as_str(),
        };
        acoes.push(format!("papel alterado para '{}'", papel));
    }
    if req.display_name.is_some() {
        acoes.push("nome de apresentação alterado".to_string());
    }
    if let Some(ref motivo) = req.blocked_reason {
        acoes.push(format!("motivo de bloqueio: \"{}\"", motivo));
    }

    let descricao = if acoes.is_empty() { "sem alterações".to_string() } else { acoes.join("; ") };
    let msg = format!("Utilizador '{}' — {} — por '{}'", username, descricao, admin.0.username);

    let db = s.db.clone();
    tokio::spawn(async move { log_evento(&db, "user_actualizado", &msg).await; });

    Json(serde_json::json!({"ok": true}))
}

/// DELETE /usuarios/:username (admin only)
pub async fn delete_usuario(
    State(s):       State<Shared>,
    admin:          AdminUser,
    Path(username): Path<String>,
) -> Json<Value> {
    if username == admin.0.username {
        return Json(serde_json::json!({"ok": false, "erro": "Não pode eliminar a própria conta"}));
    }
    match sqlx::query("DELETE FROM users WHERE username = $1")
        .bind(&username).execute(&s.db).await
    {
        Ok(r) if r.rows_affected() > 0 => {
            let db  = s.db.clone();
            let msg = format!("Utilizador '{}' eliminado permanentemente — por '{}'", username, admin.0.username);
            tokio::spawn(async move { log_evento(&db, "user_eliminado", &msg).await; });
            Json(serde_json::json!({"ok": true}))
        }
        Ok(_)  => Json(serde_json::json!({"ok": false, "erro": "Utilizador não encontrado"})),
        Err(e) => Json(serde_json::json!({"ok": false, "erro": format!("Erro DB: {}", e)})),
    }
}

// ── IP Blacklist ──────────────────────────────────────────────────────────────

/// GET /blacklist
pub async fn list_blacklist(State(s): State<Shared>, _admin: AdminUser) -> Json<Value> {
    let rows = sqlx::query(
        "SELECT id, ip::text, reason, created_at, expires_at, active \
         FROM ip_blacklist ORDER BY created_at DESC LIMIT 200"
    )
    .fetch_all(&s.db).await.unwrap_or_default();

    let list: Vec<Value> = rows.iter().map(|r| serde_json::json!({
        "id":         sqlx::Row::try_get::<i32,_>(r, "id").unwrap_or(0),
        "ip":         sqlx::Row::try_get::<String,_>(r, "ip").unwrap_or_default(),
        "reason":     sqlx::Row::try_get::<Option<String>,_>(r, "reason").ok().flatten(),
        "active":     sqlx::Row::try_get::<bool,_>(r, "active").unwrap_or(false),
        "created_at": sqlx::Row::try_get::<chrono::DateTime<Utc>,_>(r, "created_at")
                          .ok().map(|t| t.to_rfc3339()),
    })).collect();

    Json(serde_json::json!(list))
}

/// POST /blacklist — adiciona IP (admin only)
pub async fn add_blacklist(
    State(s):  State<Shared>,
    admin:     AdminUser,
    Json(req): Json<BlacklistReq>,
) -> Json<Value> {
    let blocker: Option<uuid::Uuid> = sqlx::query_scalar(
        "SELECT id FROM users WHERE username = $1"
    ).bind(&admin.0.username).fetch_optional(&s.db).await.ok().flatten();

    match sqlx::query(
        "INSERT INTO ip_blacklist (ip, reason, blocked_by) VALUES ($1::inet, $2, $3)"
    )
    .bind(&req.ip).bind(req.reason.as_deref()).bind(blocker)
    .execute(&s.db).await
    {
        Ok(_) => {
            let db  = s.db.clone();
            let ip  = req.ip.clone();
            let mot = req.reason.clone().unwrap_or_else(|| "sem motivo especificado".to_string());
            let quem = admin.0.username.clone();
            tokio::spawn(async move {
                log_evento(&db, "blacklist_adicionado",
                    &format!("IP '{}' bloqueado — motivo: {} — por '{}'", ip, mot, quem)).await;
            });
            Json(serde_json::json!({"ok": true}))
        }
        Err(e) => Json(serde_json::json!({"ok": false, "erro": format!("Erro DB: {}", e)})),
    }
}

/// POST /admin/force-logout — força saída de utilizador (admin only)
/// Invalida todos os tokens activos e limpa sessão RDP em memória
pub async fn admin_force_logout(
    State(s):  State<Shared>,
    admin:     AdminUser,
    Json(req): Json<ForceLogoutReq>,
) -> Json<Value> {
    let username = req.username.trim().to_lowercase();

    if username.is_empty() {
        return Json(serde_json::json!({"ok": false, "erro": "Username vazio"}));
    }
    if username == admin.0.username.to_lowercase() {
        return Json(serde_json::json!({"ok": false, "erro": "Não pode forçar a própria saída"}));
    }

    // 1. Registar timestamp — todos os tokens emitidos antes deste momento ficam inválidos
    let now_ts = Utc::now().timestamp();
    {
        let mut fl = s.force_logout.write().await;
        fl.insert(username.clone(), now_ts);
    }

    // 2. Limpar sessão RDP em memória + capturar info para tsdiscon
    let mut sessao_encerrada: Option<String> = None;
    let mut kill_info: Option<(String, u32)> = None; // (server_ip, session_id)
    {
        let mut st = s.inner.write().await;

        // Determinar qual cliente o utilizador ocupa
        let cliente_alvo = if st.sessoes.cliente1.conectado
            && st.sessoes.cliente1.operador.to_lowercase() == username
        {
            Some("cliente1")
        } else if st.sessoes.cliente2.conectado
            && st.sessoes.cliente2.operador.to_lowercase() == username
        {
            Some("cliente2")
        } else {
            None
        };

        if let Some(cliente) = cliente_alvo {
            // Capturar info tsdiscon antes de mutar (reads only)
            kill_info = st.rdp.get(cliente)
                .filter(|r| r.ocupado && r.nome_sessao.starts_with("rdp-tcp#"))
                .and_then(|r| r.sessao_id)
                .and_then(|sid| s.rdp_client_ip(cliente).map(|ip| (ip.to_string(), sid)));

            // Limpar sessão
            if cliente == "cliente1" {
                st.sessoes.cliente1 = Default::default();
                st.supervisoes.cliente1.clear();
            } else {
                st.sessoes.cliente2 = Default::default();
                st.supervisoes.cliente2.clear();
            }
            sessao_encerrada = Some(cliente.to_string());
            broadcast_estado(&st, &s.sse_tx);
        }
    }

    // 3. Desconectar sessão RDP Windows em background (tsdiscon)
    if let Some((ip, sid)) = kill_info {
        tokio::task::spawn_blocking(move || {
            let _ = std::process::Command::new("tsdiscon")
                .args([&sid.to_string(), &format!("/server:{}", ip)])
                .output();
        });
    }

    // 4. Audit log
    let db  = s.db.clone();
    let msg = match sessao_encerrada.as_deref() {
        Some(cliente) => format!(
            "Sessão de '{}' encerrada pelo administrador '{}' (cliente: {})",
            username, admin.0.username, cliente
        ),
        None => format!(
            "Sessão de '{}' encerrada pelo administrador '{}' (sem sessão activa registada)",
            username, admin.0.username
        ),
    };
    tokio::spawn(async move { log_evento(&db, "sessao_encerrada", &msg).await; });

    Json(serde_json::json!({"ok": true, "sessao_encerrada": sessao_encerrada}))
}

/// DELETE /blacklist/:id — remove bloqueio de IP (admin only)
pub async fn remove_blacklist(
    State(s):  State<Shared>,
    admin:     AdminUser,
    Path(id):  Path<i32>,
) -> Json<Value> {
    let remover: Option<uuid::Uuid> = sqlx::query_scalar(
        "SELECT id FROM users WHERE username = $1"
    ).bind(&admin.0.username).fetch_optional(&s.db).await.ok().flatten();

    match sqlx::query(
        "UPDATE ip_blacklist SET active = FALSE, removed_at = NOW(), removed_by = $1 WHERE id = $2"
    )
    .bind(remover).bind(id).execute(&s.db).await
    {
        Ok(r) if r.rows_affected() > 0 => {
            let db   = s.db.clone();
            let quem = admin.0.username.clone();
            tokio::spawn(async move {
                log_evento(&db, "blacklist_removido",
                    &format!("Bloqueio de IP (id={}) levantado — por '{}'", id, quem)).await;
            });
            Json(serde_json::json!({"ok": true}))
        }
        Ok(_)  => Json(serde_json::json!({"ok": false, "erro": "Não encontrado"})),
        Err(e) => Json(serde_json::json!({"ok": false, "erro": format!("Erro DB: {}", e)})),
    }
}
