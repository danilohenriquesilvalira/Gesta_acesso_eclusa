use std::{process::Command, time::Duration};
use crate::config::Config;

/// Bloqueia IP de cliente no firewall do servidor RDP via netsh.
pub fn bloquear_ip(server_ip: &str, client_ip: &str, cfg: &Config) {
    let rule_name = rule_name_for(client_ip);
    // Remove regra antiga (ignora erro se não existe) e cria nova
    run_remote_cmd(server_ip, &format!(
        "netsh advfirewall firewall delete rule name=\"{n}\"",
        n = rule_name
    ), cfg);
    run_remote_cmd(server_ip, &format!(
        "netsh advfirewall firewall add rule name=\"{n}\" \
         dir=in protocol=TCP localport=3389 remoteip={ip} action=block enable=yes",
        n = rule_name, ip = client_ip
    ), cfg);
    tracing::warn!(client_ip = %client_ip, server_ip = %server_ip, "Firewall BLOCK aplicado");
    std::thread::sleep(Duration::from_secs(2));
}

/// Remove bloqueio de IP específico no firewall do servidor RDP.
pub fn desbloquear_ip(server_ip: &str, client_ip: &str, cfg: &Config) {
    let rule_name = rule_name_for(client_ip);
    run_remote_cmd(server_ip, &format!(
        "netsh advfirewall firewall delete rule name=\"{}\"",
        rule_name
    ), cfg);
    tracing::info!(client_ip = %client_ip, server_ip = %server_ip, "Firewall UNBLOCK aplicado");
    std::thread::sleep(Duration::from_secs(1));
}

/// Limpa todas as regras EDP-Block-RDP-* no arranque — garante estado limpo mesmo após crash.
/// netsh não suporta wildcards — usa PowerShell para apagar por prefixo no Name.
pub fn limpar_todos_bloqueios(server_ip: &str, cfg: &Config) {
    run_remote_cmd(server_ip,
        "powershell -Command \"Get-NetFirewallRule | Where-Object { $_.Name -like 'EDP-Block-RDP-*' } | Remove-NetFirewallRule\"",
        cfg
    );
    tracing::info!(server_ip = %server_ip, "Bloqueios de firewall limpos no arranque");
}

/// Configura shadow mode no servidor Windows via reg add (SSH nativo).
pub fn configurar_shadow(server_ip: &str, cfg: &Config) {
    run_remote_cmd(server_ip,
        "reg add \"HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services\" \
         /v Shadow /t REG_DWORD /d 4 /f",
        cfg
    );
    tracing::info!(server_ip = %server_ip, "Shadow mode RDP configurado (view-only, sem consentimento)");
}

/// Configura sessão única RDP no servidor Windows:
/// - Máximo 1 ligação simultânea (MaxInstanceCount=1)
/// - Logoff automático de sessões Disconnected após 1 minuto (MaxDisconnectionTime=60000ms)
/// - Uma sessão por utilizador (fSingleSessionPerUser=1)
/// Elimina o dialog "Select a session to reconnect to" com múltiplas sessões.
pub fn configurar_sessao_unica(server_ip: &str, cfg: &Config) {
    let base = "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services";
    for (name, value) in [
        ("MaxInstanceCount",      "1"),
        ("MaxDisconnectionTime",  "60000"),
        ("fSingleSessionPerUser", "1"),
    ] {
        run_remote_cmd(server_ip,
            &format!("reg add \"{base}\" /v {name} /t REG_DWORD /d {value} /f"),
            cfg,
        );
    }
    tracing::info!(server_ip = %server_ip, "Sessão única RDP configurada (max 1, disc timeout 60s)");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn rule_name_for(client_ip: &str) -> String {
    // Remove sufixo CIDR (/32, /24, etc.) que o PostgreSQL INET adiciona ao devolver o IP
    let ip = client_ip.split('/').next().unwrap_or(client_ip).trim();
    format!("EDP-Block-RDP-{}", ip.replace('.', "-"))
}

/// Executa comando nativo num servidor Windows remoto.
/// Linux: SSH com chave (openssh-client na imagem Docker)
/// Windows: via wmic process call create
fn run_remote_cmd(server_ip: &str, cmd: &str, cfg: &Config) {
    #[cfg(windows)]
    {
        let result = Command::new("wmic")
            .args([
                &format!("/node:{}", server_ip),
                &format!("/user:{}", cfg.rdp_user),
                &format!("/password:{}", cfg.rdp_password),
                "process", "call", "create", cmd,
            ])
            .output();
        if let Err(e) = result {
            tracing::error!(server_ip = %server_ip, erro = %e, "WMIC falhou");
        }
    }
    #[cfg(not(windows))]
    {
        let result = Command::new("ssh")
            .args([
                "-i", &cfg.ssh_key_path,
                "-p", &cfg.ssh_port.to_string(),
                "-o", "StrictHostKeyChecking=no",
                "-o", "BatchMode=yes",
                "-o", "ConnectTimeout=5",
                &format!("{}@{}", cfg.rdp_user, server_ip),
                cmd,
            ])
            .output();
        match result {
            Ok(o) if !o.status.success() => {
                tracing::warn!(
                    server_ip = %server_ip,
                    cmd = %cmd,
                    stderr = %String::from_utf8_lossy(&o.stderr),
                    "Comando remoto retornou erro"
                );
            }
            Err(e) => tracing::error!(server_ip = %server_ip, erro = %e, "SSH falhou"),
            _ => {}
        }
    }
}

