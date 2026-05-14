-- ============================================================
--  Gestão de Acesso a Eclusas — Schema PostgreSQL 16
--  Cada ALTER/CREATE é idempotente via IF NOT EXISTS
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- full-text search em nomes

-- ============================================================
-- ENUM types
-- ============================================================
DO $$ BEGIN
  CREATE TYPE user_role   AS ENUM ('admin', 'operator', 'supervisor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active', 'blocked', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE session_status AS ENUM ('active', 'ended', 'forced_end', 'failover');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE vm_status AS ENUM ('online', 'degraded', 'offline', 'maintenance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE plc_status AS ENUM ('online', 'degraded', 'offline');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(50) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,          -- argon2id
    display_name    VARCHAR(100),
    role            user_role   NOT NULL DEFAULT 'operator',
    status          user_status NOT NULL DEFAULT 'active',
    allowed_eclusas VARCHAR(10)[],                  -- NULL = todas (admin)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login      TIMESTAMPTZ,
    blocked_reason  TEXT,
    blocked_at      TIMESTAMPTZ,
    blocked_by      UUID        REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_role     ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_status   ON users (status);

-- auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- WINCC VMs  (5 VMs primárias + cluster de backup)
-- ============================================================
CREATE TABLE IF NOT EXISTS wincc_vms (
    id                  SERIAL      PRIMARY KEY,
    name                VARCHAR(50) UNIQUE NOT NULL,   -- 'WinCC-CL', 'WinCC-CM', ...
    ip                  INET        NOT NULL,
    rdp_port            INTEGER     NOT NULL DEFAULT 3389,
    eclusa_code         VARCHAR(10),                    -- 'CL','CM','PN','RG','VR' ou NULL (cluster)
    is_cluster          BOOLEAN     NOT NULL DEFAULT FALSE,
    status              vm_status   NOT NULL DEFAULT 'online',
    last_check          TIMESTAMPTZ,
    consecutive_fails   INTEGER     NOT NULL DEFAULT 0,
    failover_target_id  INTEGER     REFERENCES wincc_vms(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wincc_vms_status ON wincc_vms (status);

-- ============================================================
-- PLCs
-- ============================================================
CREATE TABLE IF NOT EXISTS plcs (
    id                  SERIAL      PRIMARY KEY,
    name                VARCHAR(50) UNIQUE NOT NULL,
    ip                  INET        NOT NULL,
    port                INTEGER     NOT NULL DEFAULT 102,    -- Siemens S7 TCP
    vlan_id             INTEGER,
    eclusa_code         VARCHAR(10) NOT NULL,
    primary_wincc_id    INTEGER     NOT NULL REFERENCES wincc_vms(id),
    current_wincc_id    INTEGER     NOT NULL REFERENCES wincc_vms(id),  -- muda em failover
    status              plc_status  NOT NULL DEFAULT 'online',
    last_heartbeat      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plcs_eclusa  ON plcs (eclusa_code);
CREATE INDEX IF NOT EXISTS idx_plcs_status  ON plcs (status);

-- ============================================================
-- RDP SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS rdp_sessions (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       VARCHAR(50)     NOT NULL,            -- 'cliente1' .. 'cliente5'
    operator_id     UUID            REFERENCES users(id) ON DELETE SET NULL,
    eclusa_code     VARCHAR(10),
    wincc_vm_id     INTEGER         REFERENCES wincc_vms(id) ON DELETE SET NULL,
    rdp_session_id  INTEGER,                             -- session ID do Windows (qwinsta)
    client_ip       INET,
    started_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    status          session_status  NOT NULL DEFAULT 'active',
    ended_by        VARCHAR(50)                          -- 'operator','admin','failover','timeout','rdp_poll'
);

CREATE INDEX IF NOT EXISTS idx_rdp_sessions_status      ON rdp_sessions (status);
CREATE INDEX IF NOT EXISTS idx_rdp_sessions_operator    ON rdp_sessions (operator_id);
CREATE INDEX IF NOT EXISTS idx_rdp_sessions_client      ON rdp_sessions (client_id);
CREATE INDEX IF NOT EXISTS idx_rdp_sessions_started_at  ON rdp_sessions (started_at DESC);

-- ============================================================
-- SUPERVISION SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS supervision_sessions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    supervisor_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rdp_session_id  UUID        REFERENCES rdp_sessions(id) ON DELETE SET NULL,
    target_client   VARCHAR(50) NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_supervision_supervisor ON supervision_sessions (supervisor_id);
CREATE INDEX IF NOT EXISTS idx_supervision_active     ON supervision_sessions (ended_at) WHERE ended_at IS NULL;

-- ============================================================
-- IP BLACKLIST  (gerida pelo admin, suporta expiração)
-- ============================================================
CREATE TABLE IF NOT EXISTS ip_blacklist (
    id          SERIAL      PRIMARY KEY,
    ip          INET        NOT NULL,
    reason      TEXT,
    blocked_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ,                 -- NULL = permanente
    active      BOOLEAN     NOT NULL DEFAULT TRUE,
    removed_at  TIMESTAMPTZ,
    removed_by  UUID        REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ip_blacklist_ip     ON ip_blacklist (ip);
CREATE INDEX IF NOT EXISTS idx_ip_blacklist_active ON ip_blacklist (active) WHERE active = TRUE;

-- ============================================================
-- AUDIT EVENTS  (append-only, NUNCA UPDATE/DELETE)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_events (
    id          BIGSERIAL   PRIMARY KEY,
    event_type  VARCHAR(60) NOT NULL,
    user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
    description TEXT,
    metadata    JSONB,
    ip_address  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_type       ON audit_events (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_user       ON audit_events (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_metadata   ON audit_events USING gin (metadata);

-- ============================================================
-- FAILOVER EVENTS  (histórico de failovers para relatórios)
-- ============================================================
CREATE TABLE IF NOT EXISTS failover_events (
    id                  SERIAL      PRIMARY KEY,
    wincc_vm_id         INTEGER     REFERENCES wincc_vms(id) ON DELETE SET NULL,
    plc_id              INTEGER     REFERENCES plcs(id) ON DELETE SET NULL,
    from_wincc_id       INTEGER     REFERENCES wincc_vms(id) ON DELETE SET NULL,
    to_wincc_id         INTEGER     REFERENCES wincc_vms(id) ON DELETE SET NULL,
    cause               TEXT        NOT NULL,
    consecutive_fails   INTEGER     NOT NULL DEFAULT 0,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at         TIMESTAMPTZ,
    affected_sessions   UUID[],
    notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_failover_events_vm         ON failover_events (wincc_vm_id);
CREATE INDEX IF NOT EXISTS idx_failover_events_started_at ON failover_events (started_at DESC);

-- ============================================================
-- JWT TOKENS (revogação explícita — logout, bloqueio)
-- ============================================================
CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti         VARCHAR(36) PRIMARY KEY,    -- JWT ID (uuid)
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    revoked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL        -- limpar tokens já expirados
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens (expires_at);

-- ============================================================
-- VIEW: sessões RDP activas (conveniente para o dashboard)
-- ============================================================
CREATE OR REPLACE VIEW v_sessoes_ativas AS
SELECT
    r.id,
    r.client_id,
    r.eclusa_code,
    r.rdp_session_id,
    r.client_ip,
    r.started_at,
    u.username      AS operador,
    u.display_name  AS operador_nome,
    w.name          AS wincc_vm,
    w.ip            AS wincc_ip,
    (SELECT COUNT(*) FROM supervision_sessions s
     WHERE s.rdp_session_id = r.id AND s.ended_at IS NULL) AS supervisores_ativos
FROM rdp_sessions r
LEFT JOIN users       u ON u.id = r.operator_id
LEFT JOIN wincc_vms   w ON w.id = r.wincc_vm_id
WHERE r.status = 'active';

-- ============================================================
-- VIEW: saúde geral do sistema
-- ============================================================
CREATE OR REPLACE VIEW v_system_health AS
SELECT
    (SELECT COUNT(*) FROM wincc_vms WHERE status = 'online')   AS wincc_online,
    (SELECT COUNT(*) FROM wincc_vms WHERE status != 'online')  AS wincc_offline,
    (SELECT COUNT(*) FROM plcs       WHERE status = 'online')  AS plc_online,
    (SELECT COUNT(*) FROM plcs       WHERE status != 'online') AS plc_offline,
    (SELECT COUNT(*) FROM rdp_sessions WHERE status = 'active') AS sessoes_ativas,
    (SELECT COUNT(*) FROM ip_blacklist WHERE active = TRUE)    AS ips_bloqueados;
