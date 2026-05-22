use crate::config::Config;
use crate::types::{now, RdpInfo};

/// Verifica estado da sessão RDP no servidor remoto.
/// Windows: qwinsta /server:<ip> (nativo, sem dependências)
/// Linux:   ssh user@ip qwinsta  (via OpenSSH, mesmo output)
pub fn verificar_rdp(ip: &str, cfg: &Config) -> RdpInfo {
    verificar_rdp_impl(ip, cfg)
}

#[cfg(windows)]
fn verificar_rdp_impl(ip: &str, _cfg: &Config) -> RdpInfo {
    use std::process::Command;
    match Command::new("qwinsta")
        .arg(format!("/server:{}", ip))
        .output()
    {
        Ok(out) => {
            if !out.status.success() {
                return RdpInfo { verificado: false, timestamp: now(), ..Default::default() };
            }
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let (ocupado, utilizador, nome_sessao, sessao_id) = parse_qwinsta(&stdout);
            RdpInfo { ocupado, utilizador, verificado: true, timestamp: now(), nome_sessao, sessao_id, ..Default::default() }
        }
        Err(_) => RdpInfo { verificado: false, timestamp: now(), ..Default::default() },
    }
}

#[cfg(not(windows))]
fn verificar_rdp_impl(ip: &str, cfg: &Config) -> RdpInfo {
    use std::process::Command;
    match Command::new("ssh")
        .args([
            "-i", &cfg.ssh_key_path,
            "-p", &cfg.ssh_port.to_string(),
            "-o", "StrictHostKeyChecking=no",
            "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=3",
            &format!("{}@{}", cfg.rdp_user, ip),
            "qwinsta",
        ])
        .output()
    {
        Ok(out) => {
            if !out.status.success() {
                return RdpInfo { verificado: false, timestamp: now(), ..Default::default() };
            }
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let (ocupado, utilizador, nome_sessao, sessao_id) = parse_qwinsta(&stdout);
            RdpInfo { ocupado, utilizador, verificado: true, timestamp: now(), nome_sessao, sessao_id, ..Default::default() }
        }
        Err(_) => RdpInfo { verificado: false, timestamp: now(), ..Default::default() },
    }
}

/// Faz parse do output de qwinsta (idêntico local e remoto).
/// Filtra sessões SSH/console — só processa sessões rdp-tcp#*.
fn parse_qwinsta(output: &str) -> (bool, String, String, Option<u32>) {
    for line in output.lines().skip(1) {
        if line.contains("Listen") || line.contains("Idle") || line.contains("Disc") { continue; }
        if !line.to_uppercase().contains("ACTIVE") { continue; }
        let nome_sessao = line.get(1..18).map(|s| s.trim().to_string()).unwrap_or_default();
        // Ignorar sessões SSH ou de console — só RDP interessa
        if !nome_sessao.starts_with("rdp-tcp") { continue; }
        let username = line.get(19..42)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| line.get(19..).map(|s| s.trim().to_string()))
            .unwrap_or_default();
        let sessao_id: Option<u32> = line.get(42..47).and_then(|s| s.trim().parse().ok());
        return (true, username, nome_sessao, sessao_id);
    }
    (false, String::new(), String::new(), None)
}

/// Obtém o IP do cliente RDP conectado à sessão.
/// Windows: WTS API nativa (sem dependências externas)
/// Linux:   SSH + script PowerShell helper em C:\wincc-api\get_client_ip.ps1
#[cfg(windows)]
pub fn obter_ip_cliente_rdp(server_ip: &str, session_id: u32, _cfg: &Config) -> Option<String> {
    use windows::Win32::System::RemoteDesktop::{
        WTSCloseServer, WTSFreeMemory, WTSOpenServerW,
        WTSQuerySessionInformationW, WTS_CLIENT_ADDRESS, WTSClientAddress,
    };
    use windows::core::{PCWSTR, PWSTR};
    unsafe {
        let wide: Vec<u16> = server_ip.encode_utf16().chain(std::iter::once(0)).collect();
        let server        = WTSOpenServerW(PCWSTR(wide.as_ptr()));
        let mut buf       = PWSTR::null();
        let mut bytes: u32 = 0;
        let ok = WTSQuerySessionInformationW(server, session_id, WTSClientAddress, &mut buf, &mut bytes);
        let ip = if ok.is_ok() && !buf.is_null() {
            let addr = &*(buf.as_ptr() as *const WTS_CLIENT_ADDRESS);
            if addr.AddressFamily == 2 {
                let a = &addr.Address;
                let ip = format!("{}.{}.{}.{}", a[2], a[3], a[4], a[5]);
                if ip != "0.0.0.0" && !ip.starts_with("0.") { Some(ip) } else { None }
            } else { None }
        } else {
            tracing::warn!(server_ip = %server_ip, sessao_id = session_id, "WTSQuerySessionInformation falhou");
            None
        };
        if !buf.is_null() { WTSFreeMemory(buf.as_ptr() as *mut _); }
        WTSCloseServer(server);
        ip
    }
}

#[cfg(not(windows))]
pub fn obter_ip_cliente_rdp(server_ip: &str, session_id: u32, cfg: &Config) -> Option<String> {
    use std::process::Command;
    // C:\wincc-api\get_client_ip.ps1 criado pelo setup_windows_server_2022.ps1
    let output = Command::new("ssh")
        .args([
            "-i", &cfg.ssh_key_path,
            "-p", &cfg.ssh_port.to_string(),
            "-o", "StrictHostKeyChecking=no",
            "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=5",
            &format!("{}@{}", cfg.rdp_user, server_ip),
            "powershell.exe", "-NonInteractive", "-File",
            "C:\\wincc-api\\get_client_ip.ps1",
            &session_id.to_string(),
        ])
        .output()
        .ok()?;
    if !output.status.success() { return None; }
    let ip = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if ip.is_empty() || ip == "0.0.0.0" { None } else { Some(ip) }
}
