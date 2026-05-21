use std::{process::Command, time::Duration};
use crate::config::Config;

/// Bloqueia IP de cliente no firewall do servidor RDP.
/// Cria regra permanente — use desbloquear_ip para remover.
#[cfg(windows)]
pub fn bloquear_ip(server_ip: &str, client_ip: &str, cfg: &Config) {
    let rule_name = rule_name_for(client_ip);
    let ps = format!(
        "Set-NetFirewallProfile -All -Enabled True; \
         Remove-NetFirewallRule -DisplayName '{n}' -ErrorAction SilentlyContinue; \
         New-NetFirewallRule -DisplayName '{n}' -Direction Inbound \
           -LocalPort 3389 -Protocol TCP -Action Block \
           -RemoteAddress {ip} -Profile Any -Enabled True | Out-Null; \
         Write-Output 'OK'",
        n = rule_name, ip = client_ip
    );
    run_remote_ps(server_ip, &ps, cfg);
    tracing::warn!(client_ip = %client_ip, server_ip = %server_ip, "Firewall BLOCK aplicado");
    // Pausa para a regra propagar antes do próximo poll
    std::thread::sleep(Duration::from_secs(4));
}

/// Remove bloqueio de IP específico no firewall do servidor RDP.
pub fn desbloquear_ip(server_ip: &str, client_ip: &str, cfg: &Config) {
    let rule_name = rule_name_for(client_ip);
    let ps = format!(
        "Remove-NetFirewallRule -DisplayName '{}' -ErrorAction SilentlyContinue; Write-Output 'OK'",
        rule_name
    );
    run_remote_ps(server_ip, &ps, cfg);
    tracing::info!(client_ip = %client_ip, server_ip = %server_ip, "Firewall UNBLOCK aplicado");
    // Aguarda propagação antes de abrir RDP
    std::thread::sleep(Duration::from_secs(3));
}

/// Remove TODAS as regras EDP-Block-RDP-* do servidor.
/// Chamado no startup para limpar resíduos de execuções anteriores.
#[cfg(windows)]
pub fn limpar_todos_bloqueios(server_ip: &str, cfg: &Config) {
    let ps = "Get-NetFirewallRule -DisplayName 'EDP-Block-RDP-*' \
              -ErrorAction SilentlyContinue | Remove-NetFirewallRule; Write-Output 'OK'";
    run_remote_ps(server_ip, ps, cfg);
    tracing::info!(server_ip = %server_ip, "Bloqueios de firewall limpos no arranque");
}

/// Configura shadow mode no servidor Windows: view-only sem consentimento.
/// Shadow=4 → Interactive, no consent (Windows Server 2022)
#[cfg(windows)]
pub fn configurar_shadow(server_ip: &str, cfg: &Config) {
    let ps = "$p='HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services'; \
              if(-not(Test-Path $p)){New-Item -Path $p -Force|Out-Null}; \
              Set-ItemProperty -Path $p -Name 'Shadow' -Value 4 -Type DWord -Force; \
              Write-Output 'OK'";
    run_remote_ps(server_ip, ps, cfg);
    tracing::info!(server_ip = %server_ip, "Shadow mode RDP configurado (view-only, sem consentimento)");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn rule_name_for(client_ip: &str) -> String {
    format!("EDP-Block-RDP-{}", client_ip.replace('.', "-"))
}

/// Executa um comando PowerShell num servidor remoto via WMIC.
fn run_remote_ps(server_ip: &str, ps: &str, cfg: &Config) {
    let cmd = format!("powershell.exe -NonInteractive -Command \"{}\"", ps);
    let result = Command::new("wmic")
        .args([
            &format!("/node:{}", server_ip),
            &format!("/user:{}", cfg.rdp_user),
            &format!("/password:{}", cfg.rdp_password),
            "process", "call", "create", &cmd,
        ])
        .output();
    if let Err(e) = result {
        tracing::error!(server_ip = %server_ip, erro = %e, "WMIC falhou");
    }
}
