-- ============================================================
--  Seed inicial — dados de base para o sistema funcionar
--  Passwords são geradas com argon2id pelo backend no primeiro arranque
--  Este seed usa um hash temporário (substituído pelo backend)
-- ============================================================

-- Admin padrão (password: Admin@2026 — ALTERAR EM PRODUÇÃO)
-- Hash argon2id de 'Admin@2026' gerado offline para seed inicial
-- O backend valida e pode forçar troca no primeiro login
INSERT INTO users (username, display_name, role, status, allowed_eclusas, password_hash)
VALUES (
    'admin',
    'Administrador do Sistema',
    'admin',
    'active',
    NULL,
    '$argon2id$v=19$m=19456,t=2,p=1$seed-placeholder-muda-no-1o-login$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
)
ON CONFLICT (username) DO NOTHING;

-- WinCC VMs — ambiente Proxmox (3 VMs activas, expandir quando forem criadas CL/CM/VR)
-- VM 101=RG (.13), VM 102=PN (.14), VM 103=Reserva (.15)
INSERT INTO wincc_vms (name, ip, rdp_port, eclusa_code, is_cluster, failover_target_id)
VALUES
    ('WinCC-RG',      '172.29.164.13', 3389, 'RG', FALSE, NULL),
    ('WinCC-PN',      '172.29.164.14', 3389, 'PN', FALSE, NULL),
    ('WinCC-Reserva', '172.29.164.15', 3389, NULL, TRUE,  NULL)
ON CONFLICT (name) DO NOTHING;

-- Definir failover_target para todas as VMs -> Cluster
UPDATE wincc_vms SET failover_target_id = (SELECT id FROM wincc_vms WHERE is_cluster = TRUE LIMIT 1)
WHERE is_cluster = FALSE AND failover_target_id IS NULL;

-- PLCs das 5 eclusas (IPs a configurar conforme VLANs)
INSERT INTO plcs (name, ip, port, vlan_id, eclusa_code, primary_wincc_id, current_wincc_id)
SELECT
    p.name, p.ip::INET, p.port, p.vlan_id, p.eclusa_code,
    (SELECT id FROM wincc_vms WHERE eclusa_code = p.eclusa_code LIMIT 1),
    (SELECT id FROM wincc_vms WHERE eclusa_code = p.eclusa_code LIMIT 1)
FROM (VALUES
    ('PLC-CL', '10.10.1.10', 102, 10, 'CL'),
    ('PLC-CM', '10.10.2.10', 102, 20, 'CM'),
    ('PLC-PN', '10.10.3.10', 102, 30, 'PN'),
    ('PLC-RG', '10.10.4.10', 102, 40, 'RG'),
    ('PLC-VR', '10.10.5.10', 102, 50, 'VR')
) AS p(name, ip, port, vlan_id, eclusa_code)
ON CONFLICT (name) DO NOTHING;

-- Evento de auditoria inicial
INSERT INTO audit_events (event_type, description, metadata)
VALUES ('system_init', 'Base de dados iniciada', '{"version": "1.0.0"}'::jsonb);
