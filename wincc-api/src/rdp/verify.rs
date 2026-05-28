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
    use std::time::Duration;

    // TCP connect à porta 3389 — TermService fecha cedo no shutdown,
    // muito antes do SSH bloquear. Timeout 1s é suficiente.
    let addr = match format!("{}:3389", ip).parse() {
        Ok(a)  => a,
        Err(_) => return RdpInfo { verificado: false, timestamp: now(), ..Default::default() },
    };
    let rdp_port_ok = std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(1)).is_ok();

    if !rdp_port_ok {
        return RdpInfo { verificado: false, timestamp: now(), ..Default::default() };
    }

    let mut child = match Command::new("ssh")
        .args([
            "-i", &cfg.ssh_key_path,
            "-p", &cfg.ssh_port.to_string(),
            "-o", "StrictHostKeyChecking=no",
            "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=3",
            "-o", "ServerAliveInterval=2",
            "-o", "ServerAliveCountMax=1",
            &format!("{}@{}", cfg.rdp_user, ip),
            "qwinsta",
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c)  => c,
        Err(_) => return RdpInfo { verificado: false, timestamp: now(), ..Default::default() },
    };

    // Timeout total de 4s — evita bloquear o poll quando o servidor está em shutdown
    // e o TCP aceita ligação mas o SSH fica pendurado à espera do qwinsta
    let timeout = Duration::from_secs(4);
    let start   = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let out = child.wait_with_output().unwrap_or_else(|_| std::process::Output { status: status, stdout: vec![], stderr: vec![] });
                if !status.success() {
                    return RdpInfo { verificado: false, timestamp: now(), ..Default::default() };
                }
                let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                let (ocupado, utilizador, nome_sessao, sessao_id) = parse_qwinsta(&stdout);
                return RdpInfo { ocupado, utilizador, verificado: true, timestamp: now(), nome_sessao, sessao_id, ..Default::default() };
            }
            Ok(None) => {
                if start.elapsed() >= timeout {
                    let _ = child.kill();
                    return RdpInfo { verificado: false, timestamp: now(), ..Default::default() };
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(_) => return RdpInfo { verificado: false, timestamp: now(), ..Default::default() },
        }
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
pub fn obter_ip_cliente_rdp(server_ip: &str, _session_id: u32, cfg: &Config) -> Option<String> {
    use std::process::Command;
    use std::time::Duration;

    // netstat -n como string única — SSH nativo do Windows Server não aceita args separados
    let mut child = Command::new("ssh")
        .args([
            "-i", &cfg.ssh_key_path,
            "-p", &cfg.ssh_port.to_string(),
            "-o", "StrictHostKeyChecking=no",
            "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=5",
            "-o", "ServerAliveInterval=2",
            "-o", "ServerAliveCountMax=1",
            &format!("{}@{}", cfg.rdp_user, server_ip),
            "netstat -n",
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .ok()?;

    // Timeout de 5s
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {
                if start.elapsed() >= Duration::from_secs(5) {
                    let _ = child.kill();
                    return None;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(_) => { let _ = child.kill(); return None; }
        }
    }

    let out = child.wait_with_output().ok()?;
    if !out.status.success() { return None; }
    let stdout = String::from_utf8_lossy(&out.stdout);

    // Linha Windows: TCP    172.29.164.13:3389    172.29.164.100:54321    ESTABLISHED
    for line in stdout.lines() {
        let line = line.trim();
        if !line.contains(":3389") || !line.contains("ESTABLISHED") { continue; }
        let parts: Vec<&str> = line.split_whitespace().collect();
        // ["TCP", "server:3389", "client:port", "ESTABLISHED"]
        if parts.len() < 4 { continue; }
        // Confirmar que é a porta local 3389 (não o lado remoto)
        if !parts[1].ends_with(":3389") { continue; }
        let remote = parts[2]; // "client_ip:port"
        if let Some(ip) = remote.rsplit_once(':').map(|(ip, _)| ip) {
            if !ip.is_empty() && ip != "0.0.0.0" && ip != server_ip {
                return Some(ip.to_string());
            }
        }
    }
    None
}
