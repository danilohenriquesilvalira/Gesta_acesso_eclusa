use std::{process::Command, time::Duration};
use crate::{config::Config, types::now};

/// Bloqueia IP de cliente no firewall do servidor RDP.
/// Cria regra permanente — use remove_ip_block para desbloquear.
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
    eprintln!("[{}] Firewall BLOCK {} em {}", now(), client_ip, server_ip);
    // Pequena pausa para a regra propagar antes do próximo poll
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
    eprintln!("[{}] Firewall UNBLOCK {} em {}", now(), client_ip, server_ip);
    // Aguarda propagação antes de abrir RDP
    std::thread::sleep(Duration::from_secs(3));
}

/// Remove TODAS as regras EDP-Block-RDP-* do servidor.
/// Chamado no startup para limpar resíduos de execuções anteriores.
pub fn limpar_todos_bloqueios(server_ip: &str, cfg: &Config) {
    let ps = "Get-NetFirewallRule -DisplayName 'EDP-Block-RDP-*' \
              -ErrorAction SilentlyContinue | Remove-NetFirewallRule; Write-Output 'OK'";
    run_remote_ps(server_ip, ps, cfg);
    eprintln!("[{}] Bloqueios de firewall limpos em {}", now(), server_ip);
}

/// Configura shadow mode no servidor Windows: view-only sem consentimento.
/// Shadow=4 → Interactive, no consent (Windows Server 2012 R2+)
pub fn configurar_shadow(server_ip: &str, cfg: &Config) {
    let ps = "$p='HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services'; \
              if(-not(Test-Path $p)){New-Item -Path $p -Force|Out-Null}; \
              Set-ItemProperty -Path $p -Name 'Shadow' -Value 4 -Type DWord -Force; \
              Write-Output 'OK'";
    run_remote_ps(server_ip, ps, cfg);
    eprintln!("[{}] Shadow mode configurado em {}", now(), server_ip);
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
        eprintln!("[{}] WMIC falhou em {}: {}", now(), server_ip, e);
    }
}
