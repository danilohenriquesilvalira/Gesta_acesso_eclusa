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
    rdp::{broadcast_estado, desbloquear_ip_firewall, firewall::bloquear_ip},
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

    // Validação básica de tamanho (evita argon2 com input gigante)
    if username.len() > 64 || req.password.len() > 256 {
        return Json(serde_json::json!({"ok": false, "erro": "Credenciais inválidas"}));
    }

    // Buscar utilizador no PostgreSQL
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
    let password  = req.password.clone();
    let hash_cmp  = hash.clone();
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

    // Desbloquear IP na DB — await directo para que a resposta ao cliente já reflicta o estado correcto
    {
        let result = sqlx::query(
            "UPDATE ip_blacklist SET active = FALSE, expires_at = NOW() \
             WHERE ip >>= $1::inet AND active = TRUE"
        )
        .bind(&caller_ip)
        .execute(&s.db)
        .await;
        match &result {
            Ok(r)  => tracing::info!(ip = %caller_ip, rows = r.rows_affected(), "ip_blacklist desbloqueado após login"),
            Err(e) => tracing::error!(ip = %caller_ip, erro = %e, "Falha ao desbloquear ip_blacklist"),
        }
    }

    // Desbloquear firewall em todos os servidores em background (operação lenta — SSH)
    {
        let cfg         = s.cfg.clone();
        let caller_ip_u = caller_ip.clone();
        let todos_ips: Vec<String> = s.rdp_clients.iter().map(|c| c.ip.clone())
            .chain(s.servidores.iter().map(|sv| sv.ip.clone()))
            .collect();
        let db_u   = s.db.clone();
        let user_u = username.clone();
        tokio::spawn(async move {
            log_evento_com_ip(&db_u, "ip_desbloqueado",
                &format!("IP desbloqueado após login bem-sucedido: utilizador '{}'", user_u),
                &caller_ip_u).await;
        });
        tokio::task::spawn_blocking(move || {
            for server_ip in &todos_ips {
                desbloquear_ip_firewall(server_ip, &caller_ip_u, &cfg);
            }
        });
    }

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

/// POST /auth/logout — revoga token JWT
pub async fn auth_logout(State(s): State<Shared>, auth: AuthUser) -> Json<Value> {
    let exp = Utc::now() + chrono::Duration::hours(crate::config::JWT_EXPIRY_HOURS);
    let exp_ts = exp.timestamp();

    // Persistir revogação no DB
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

    // Popular cache em memória — próximas requests são rejeitadas sem DB query
    {
        let mut cache = s.revoked_jtis.write().await;
        cache.insert(auth.jti.clone(), exp_ts);
    }

    log_evento_bg(&s.db, "logout", &format!("Sessão terminada: utilizador '{}'", auth.username));
    Json(serde_json::json!({"ok": true}))
}

// ── User CRUD ─────────────────────────────────────────────────────────────────

/// GET /usuarios — lista utilizadores (admin only), enriquecida com sessão activa
pub async fn list_usuarios(State(s): State<Shared>, _admin: AdminUser) -> Json<Value> {
    let rows = match sqlx::query(
        "SELECT username, display_name, role::text AS role, status::text AS status, last_login, created_at \
         FROM users ORDER BY username"
    )
    .fetch_all(&s.db)
    .await
    {
        Ok(r)  => r,
        Err(e) => {
            tracing::error!(erro = %e, "Falha ao listar utilizadores");
            return Json(serde_json::json!({"ok": false, "erro": "Erro de base de dados"}));
        }
    };

    // Sessões activas em memória — read lock curto
    let (op_rg, op_pn) = {
        let st = s.inner.read().await;
        (
            if st.sessoes.eclusa_RG.conectado { st.sessoes.eclusa_RG.operador.to_lowercase() } else { String::new() },
            if st.sessoes.eclusa_PN.conectado { st.sessoes.eclusa_PN.operador.to_lowercase() } else { String::new() },
        )
    };

    let users: Vec<Value> = rows.iter().map(|r| {
        let uname: String = sqlx::Row::try_get(r, "username").unwrap_or_default();
        let (sessao_ativa, cliente_ativo) = if !op_rg.is_empty() && op_rg == uname.to_lowercase() {
            (true, Some("eclusa_RG"))
        } else if !op_pn.is_empty() && op_pn == uname.to_lowercase() {
            (true, Some("eclusa_PN"))
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
    if username.is_empty() || username.len() > 64 {
        return Json(serde_json::json!({"ok": false, "erro": "Username inválido"}));
    }
    if req.password.len() < 8 || req.password.len() > 256 {
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

/// PUT /usuarios/:username — actualiza campos do utilizador numa transacção atómica (admin only)
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

    // Todas as alterações numa transacção — nenhuma fica a meio em caso de falha
    let admin_username = admin.0.username.clone();
    let result: Result<(), sqlx::Error> = async {
        let mut tx = s.db.begin().await?;

        if let Some(ref v) = req.display_name {
            sqlx::query("UPDATE users SET display_name = $1 WHERE username = $2")
                .bind(v).bind(&username).execute(&mut *tx).await?;
        }
        if let Some(ref v) = req.role {
            sqlx::query("UPDATE users SET role = $1::user_role WHERE username = $2")
                .bind(v).bind(&username).execute(&mut *tx).await?;
        }
        if let Some(ref v) = req.status {
            sqlx::query("UPDATE users SET status = $1::user_status WHERE username = $2")
                .bind(v).bind(&username).execute(&mut *tx).await?;
            if v == "blocked" {
                let blocker: Option<uuid::Uuid> = sqlx::query_scalar(
                    "SELECT id FROM users WHERE username = $1"
                ).bind(&admin_username).fetch_optional(&mut *tx).await?;
                sqlx::query(
                    "UPDATE users SET blocked_at = NOW(), blocked_by = $1 WHERE username = $2"
                ).bind(blocker).bind(&username).execute(&mut *tx).await?;
            }
        }
        if let Some(ref v) = req.blocked_reason {
            sqlx::query("UPDATE users SET blocked_reason = $1 WHERE username = $2")
                .bind(v).bind(&username).execute(&mut *tx).await?;
        }

        tx.commit().await?;
        Ok(())
    }.await;

    if let Err(e) = result {
        tracing::error!(utilizador = %username, erro = %e, "Falha ao actualizar utilizador");
        return Json(serde_json::json!({"ok": false, "erro": format!("Erro DB: {}", e)}));
    }

    // Mensagem de auditoria detalhada
    let mut acoes: Vec<String> = Vec::new();
    if let Some(ref v) = req.status {
        acoes.push(match v.as_str() {
            "blocked"  => "conta bloqueada".to_string(),
            "active"   => "conta reactivada".to_string(),
            "inactive" => "conta desactivada".to_string(),
            _          => "estado alterado".to_string(),
        });
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
    let rows = match sqlx::query(
        "SELECT id, ip::text, reason, servidor_ip::text, utilizador, created_at, active \
         FROM ip_blacklist ORDER BY created_at DESC LIMIT 200"
    )
    .fetch_all(&s.db).await
    {
        Ok(r)  => r,
        Err(e) => {
            tracing::error!(erro = %e, "Falha ao listar blacklist");
            return Json(serde_json::json!({"ok": false, "erro": "Erro de base de dados"}));
        }
    };

    let list: Vec<Value> = rows.iter().map(|r| serde_json::json!({
        "id":          sqlx::Row::try_get::<i32,_>(r, "id").unwrap_or(0),
        "ip":          sqlx::Row::try_get::<String,_>(r, "ip").unwrap_or_default(),
        "reason":      sqlx::Row::try_get::<Option<String>,_>(r, "reason").ok().flatten(),
        "servidor_ip": sqlx::Row::try_get::<Option<String>,_>(r, "servidor_ip").ok().flatten(),
        "utilizador":  sqlx::Row::try_get::<Option<String>,_>(r, "utilizador").ok().flatten(),
        "active":      sqlx::Row::try_get::<bool,_>(r, "active").unwrap_or(false),
        "created_at":  sqlx::Row::try_get::<chrono::DateTime<Utc>,_>(r, "created_at")
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
            let db   = s.db.clone();
            let ip   = req.ip.clone();
            let mot  = req.reason.clone().unwrap_or_else(|| "sem motivo especificado".to_string());
            let quem = admin.0.username.clone();
            tokio::spawn(async move {
                log_evento(&db, "blacklist_adicionado",
                    &format!("IP '{}' bloqueado — motivo: {} — por '{}'", ip, mot, quem)).await;
            });

            // Aplicar regra no firewall — cada servidor em thread própria para não bloquear
            let cfg     = s.cfg.clone();
            let ip_bl   = req.ip.clone();
            let servers: Vec<String> = s.servidores.iter().map(|c| c.ip.clone()).collect();
            for srv in servers {
                let cfg2   = cfg.clone();
                let ip2    = ip_bl.clone();
                tokio::task::spawn_blocking(move || bloquear_ip(&srv, &ip2, &cfg2));
            }

            Json(serde_json::json!({"ok": true}))
        }
        Err(e) => Json(serde_json::json!({"ok": false, "erro": format!("Erro DB: {}", e)})),
    }
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

    // Obter o IP antes de marcar como inactivo — necessário para remover firewall
    let ip_entry: Option<String> = sqlx::query_scalar(
        "SELECT ip::text FROM ip_blacklist WHERE id = $1 AND active = TRUE"
    ).bind(id).fetch_optional(&s.db).await.ok().flatten();

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

            // Remover regra do firewall — cada servidor em thread própria para não bloquear
            if let Some(ip_bl) = ip_entry {
                let cfg     = s.cfg.clone();
                let servers: Vec<String> = s.servidores.iter().map(|c| c.ip.clone()).collect();
                for srv in servers {
                    let cfg2 = cfg.clone();
                    let ip2  = ip_bl.clone();
                    tokio::task::spawn_blocking(move || desbloquear_ip_firewall(&srv, &ip2, &cfg2));
                }
            }

            Json(serde_json::json!({"ok": true}))
        }
        Ok(_)  => Json(serde_json::json!({"ok": false, "erro": "Não encontrado"})),
        Err(e) => Json(serde_json::json!({"ok": false, "erro": format!("Erro DB: {}", e)})),
    }
}

/// POST /admin/force-logout — força saída de utilizador (admin only)
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
    let mut kill_info: Option<(String, u32)> = None;
    {
        let mut st = s.inner.write().await;

        let cliente_alvo = if st.sessoes.eclusa_RG.conectado
            && st.sessoes.eclusa_RG.operador.to_lowercase() == username
        {
            Some("eclusa_RG")
        } else if st.sessoes.eclusa_PN.conectado
            && st.sessoes.eclusa_PN.operador.to_lowercase() == username
        {
            Some("eclusa_PN")
        } else {
            None
        };

        if let Some(cliente) = cliente_alvo {
            kill_info = st.rdp.get(cliente)
                .filter(|r| r.ocupado && r.nome_sessao.starts_with("rdp-tcp#"))
                .and_then(|r| r.sessao_id)
                .and_then(|sid| s.rdp_client_ip(cliente).map(|ip| (ip.to_string(), sid)));

            if cliente == "eclusa_RG" {
                st.sessoes.eclusa_RG = Default::default();
                st.supervisoes.eclusa_RG.clear();
            } else {
                st.sessoes.eclusa_PN = Default::default();
                st.supervisoes.eclusa_PN.clear();
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
