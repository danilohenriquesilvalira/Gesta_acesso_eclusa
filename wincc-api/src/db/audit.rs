use sqlx::PgPool;

// ── Tipos de evento — namespace.acao ─────────────────────────────────────────
//
// auth.*        — autenticação e sessões de utilizador
// sessao.*      — sessões RDP de operadores nas eclusas
// supervisao.*  — supervisão de operadores
// failover.*    — falhas de servidor e activações de reserva
// sistema.*     — blacklist, bloqueios de IP
// utilizador.*  — gestão de contas

pub mod tipo {
    // auth
    pub const AUTH_LOGIN_OK:       &str = "auth.login_ok";
    pub const AUTH_LOGIN_FALHOU:   &str = "auth.login_falhou";
    pub const AUTH_LOGOUT:         &str = "auth.logout";
    #[allow(dead_code)]
    pub const AUTH_FORCE_LOGOUT:   &str = "auth.force_logout";
    #[allow(dead_code)]
    pub const AUTH_SENHA_ALTERADA: &str = "auth.senha_alterada";

    // sessao
    pub const SESSAO_INICIADA:         &str = "sessao.iniciada";
    pub const SESSAO_ENCERRADA:        &str = "sessao.encerrada";
    pub const SESSAO_ENCERRADA_WINCC:  &str = "sessao.encerrada_wincc";
    pub const SESSAO_AUTO_ENCERRADA:   &str = "sessao.auto_encerrada";
    pub const SESSAO_RETORNO_ORIGINAL: &str = "sessao.retorno_original";
    pub const SESSAO_FORCE_ENCERRADA:  &str = "sessao.force_encerrada";

    // supervisao
    pub const SUPERVISAO_INICIADA:  &str = "supervisao.iniciada";
    pub const SUPERVISAO_ENCERRADA: &str = "supervisao.encerrada";

    // failover
    pub const FAILOVER_INICIADO:     &str = "failover.iniciado";
    pub const FAILOVER_RESOLVIDO:    &str = "failover.resolvido";
    pub const FAILOVER_WINDOWS_CAIU: &str = "failover.windows_caiu";
    pub const FAILOVER_WINCC_CAIU:   &str = "failover.wincc_caiu";

    // sistema
    pub const SISTEMA_IP_BLOQUEADO:      &str = "sistema.ip_bloqueado";
    pub const SISTEMA_IP_DESBLOQUEADO:   &str = "sistema.ip_desbloqueado";
    pub const SISTEMA_BLACKLIST_ADD:     &str = "sistema.blacklist_add";
    pub const SISTEMA_BLACKLIST_REMOVIDO:&str = "sistema.blacklist_removido";

    // utilizador
    pub const UTILIZADOR_CRIADO:    &str = "utilizador.criado";
    pub const UTILIZADOR_EDITADO:   &str = "utilizador.editado";
    pub const UTILIZADOR_ELIMINADO: &str = "utilizador.eliminado";
}

// ── Função central — todas as chamadas passam aqui ───────────────────────────

/// Regista um evento de auditoria com IP opcional.
/// Usar sempre esta função — nunca INSERT directo nos handlers.
pub async fn log(
    db:         &PgPool,
    event_type: &str,
    descricao:  &str,
    ip:         Option<&str>,
) {
    let res = if let Some(ip) = ip {
        sqlx::query(
            "INSERT INTO audit_events (event_type, description, ip_address) \
             VALUES ($1, $2, $3::inet)"
        )
        .bind(event_type)
        .bind(descricao)
        .bind(ip)
        .execute(db)
        .await
    } else {
        sqlx::query(
            "INSERT INTO audit_events (event_type, description) \
             VALUES ($1, $2)"
        )
        .bind(event_type)
        .bind(descricao)
        .execute(db)
        .await
    };

    if let Err(e) = res {
        tracing::error!(erro = %e, event_type, "Falha ao registar evento de auditoria");
    }
}

/// Versão fire-and-forget — para usar em contextos sync ou sem await disponível.
pub fn log_bg(db: &PgPool, event_type: &str, descricao: &str, ip: Option<&str>) {
    let db  = db.clone();
    let t   = event_type.to_string();
    let d   = descricao.to_string();
    let i   = ip.map(|s| s.to_string());
    tokio::spawn(async move {
        log(&db, &t, &d, i.as_deref()).await;
    });
}

