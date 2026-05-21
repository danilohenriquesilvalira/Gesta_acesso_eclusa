#[cfg(windows)]
use std::process::Command;
#[cfg(windows)]
use crate::config::Config;
use crate::types::{now, RdpInfo};

/// Chama qwinsta no servidor RDP remoto (Windows Server 2022) e devolve o estado actual da sessão.
/// Usa o comando nativo do Windows — NÃO usa RustDesk nem qualquer cliente RDP de terceiros.
/// Em Linux retorna sempre inacessível (qwinsta não existe fora de Windows).
pub fn verificar_rdp(ip: &str) -> RdpInfo {
    #[cfg(not(windows))]
    {
        let _ = ip;
        return RdpInfo { verificado: false, timestamp: now(), ..Default::default() };
    }

    #[cfg(windows)]
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

#[cfg(windows)]
fn parse_qwinsta(output: &str) -> (bool, String, String, Option<u32>) {
    for line in output.lines().skip(1) {
        if line.contains("Listen") || line.contains("Idle") || line.contains("Disc") { continue; }
        if !line.to_uppercase().contains("ACTIVE") { continue; }
        let nome_sessao = line.get(1..18).map(|s| s.trim().to_string()).unwrap_or_default();
        let username    = line.get(19..42)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| line.get(19..).map(|s| s.trim().to_string()))
            .unwrap_or_default();
        let sessao_id: Option<u32> = line.get(42..47).and_then(|s| s.trim().parse().ok());
        return (true, username, nome_sessao, sessao_id);
    }
    (false, String::new(), String::new(), None)
}

/// Obtém o IP do cliente RDP via WTS API (Windows Server 2022 — nativo).
/// Não usa RustDesk nem qualquer software de terceiros.
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
