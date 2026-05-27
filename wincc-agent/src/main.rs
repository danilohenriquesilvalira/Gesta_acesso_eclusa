use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const WINCC_PORT:         u16 = 8181;
const WINCC_TIMEOUT_SECS: u64 = 10;

struct Config {
    api_url:      String,
    servidor:     String,
    agent_secret: String,
}

fn load_config() -> Config {
    let bytes = std::fs::read("C:\\wincc-agent\\config.json").unwrap_or_default();
    // Remove BOM UTF-8 (EF BB BF) que o PowerShell 5 adiciona automaticamente
    let content = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        String::from_utf8_lossy(&bytes[3..]).into_owned()
    } else {
        String::from_utf8_lossy(&bytes).into_owned()
    };
    let v: serde_json::Value = serde_json::from_str(&content).unwrap_or_default();
    Config {
        api_url:      v["api_url"].as_str().unwrap_or("http://172.29.164.12:8080").to_string(),
        servidor:     v["servidor"].as_str().unwrap_or("RG").to_string(),
        agent_secret: v["agent_secret"].as_str().unwrap_or("wincc-agent-secret-edp").to_string(),
    }
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}

// Ativa suporte ANSI no terminal Windows (necessário para mover cursor)
fn enable_ansi() {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::System::Console::{
        GetConsoleMode, SetConsoleMode, ENABLE_VIRTUAL_TERMINAL_PROCESSING,
    };
    unsafe {
        let handle = std::io::stdout().as_raw_handle() as isize;
        let mut mode: u32 = 0;
        if GetConsoleMode(handle, &mut mode) != 0 {
            SetConsoleMode(handle, mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
        }
    }
}

fn desenhar_dashboard(windows_vivo: bool, wincc_vivo: bool, elapsed: u64, backend_ok: bool, primeira_vez: bool) {
    if !primeira_vez {
        // Sobe 3 linhas e limpa para redesenhar
        print!("\x1B[3A\x1B[0J");
    }
    println!("  Windows  : [ {} ]", if windows_vivo { "VIVO " } else { "MORTO" });
    println!("  WinCC    : [ {} ]  (ultimo sinal ha {}s)", if wincc_vivo { "VIVO " } else { "MORTO" }, elapsed);
    println!("  Backend  : [ {} ]", if backend_ok { "OK    " } else { "FALHOU" });
    // Força flush imediato
    let _ = std::io::stdout().flush();
}

fn main() {
    enable_ansi();

    let cfg = load_config();
    let api_url      = cfg.api_url.clone();
    let servidor     = cfg.servidor.clone();
    let agent_secret = cfg.agent_secret.clone();

    let last_alive  = Arc::new(AtomicU64::new(0));
    let last_bit    = Arc::new(AtomicU64::new(0));
    let stop        = Arc::new(AtomicBool::new(false));

    println!("╔══════════════════════════════════════════════════╗");
    println!("║         WinCC Agent — Controlo de Acesso         ║");
    println!("╠══════════════════════════════════════════════════╣");
    println!("║  Servidor : {:<38}║", servidor);
    println!("║  API      : {:<38}║", api_url);
    println!("║  Porta    : {:<38}║", WINCC_PORT);
    println!("╚══════════════════════════════════════════════════╝");
    println!();

    // Thread A: servidor HTTP local — recebe pedidos do WinCC VBScript
    {
        let stop         = stop.clone();
        let la           = last_alive.clone();
        let lb           = last_bit.clone();
        let api_url_t    = api_url.clone();
        let secret_t     = agent_secret.clone();
        std::thread::spawn(move || {
            match TcpListener::bind(format!("127.0.0.1:{}", WINCC_PORT)) {
                Ok(listener) => {
                    listener.set_nonblocking(true).ok();
                    loop {
                        if stop.load(Ordering::Relaxed) { break; }
                        match listener.accept() {
                            Ok((mut stream, _)) => {
                                stream.set_read_timeout(Some(Duration::from_millis(200))).ok();
                                let mut buf = [0u8; 1024];
                                let n = stream.read(&mut buf).unwrap_or(0);
                                let req = std::str::from_utf8(&buf[..n]).unwrap_or("");

                                if req.contains("POST") && req.contains("/wincc-alive") {
                                    // Life bit — toggle para WinCC saber que agente está vivo
                                    la.store(now_secs(), Ordering::Relaxed);
                                    let bit = if lb.load(Ordering::Relaxed) == 0 { 1u64 } else { 0u64 };
                                    lb.store(bit, Ordering::Relaxed);
                                    let body = format!("{{\"life_bit\":{}}}", bit);
                                    let resp = format!(
                                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                                        body.len(), body
                                    );
                                    stream.write_all(resp.as_bytes()).ok();

                                } else if req.contains("POST") && req.contains("/encerrar-sessao") {
                                    // WinCC activou bit Encerrar_Sessao=1 — encaminhar para backend
                                    let url    = format!("{}/sessoes/encerrar-agente", api_url_t);
                                    let body   = format!("{{\"secret\":\"{}\"}}", secret_t);
                                    let ok = ureq::post(&url)
                                        .set("Content-Type", "application/json")
                                        .timeout(Duration::from_secs(5))
                                        .send_string(&body)
                                        .map(|r| r.status() == 200)
                                        .unwrap_or(false);
                                    let resp_body = if ok { "{\"ok\":true}" } else { "{\"ok\":false}" };
                                    let resp = format!(
                                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                                        resp_body.len(), resp_body
                                    );
                                    stream.write_all(resp.as_bytes()).ok();

                                } else {
                                    stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n").ok();
                                }
                            }
                            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                                std::thread::sleep(Duration::from_millis(100));
                            }
                            Err(_) => std::thread::sleep(Duration::from_millis(100)),
                        }
                    }
                }
                Err(e) => println!("[ERRO] Porta {}: {}", WINCC_PORT, e),
            }
        });
    }

    // Thread B: heartbeat ao backend (1s)
    {
        let stop = stop.clone();
        let url  = format!("{}/heartbeat/{}", api_url, servidor);
        std::thread::spawn(move || {
            loop {
                if stop.load(Ordering::Relaxed) { break; }
                let _ = ureq::post(&url).timeout(Duration::from_secs(2)).send_string("");
                std::thread::sleep(Duration::from_secs(1));
            }
        });
    }

    // Loop principal: wincc-status ao backend (3s) + dashboard fixo
    {
        let url        = format!("{}/wincc-status/{}", api_url, servidor);
        let la         = last_alive.clone();
        let mut primeira_vez = true;

        println!("  Windows  : [ VIVO  ]");
        println!("  WinCC    : [ ----- ]  (a iniciar...)");
        println!("  Backend  : [ ----- ]");
        let _ = std::io::stdout().flush();

        loop {
            std::thread::sleep(Duration::from_secs(3));

            let elapsed    = now_secs().saturating_sub(la.load(Ordering::Relaxed));
            let wincc_vivo = elapsed < WINCC_TIMEOUT_SECS;
            let body       = format!("{{\"vivo\":{}}}", wincc_vivo);

            let backend_ok = ureq::post(&url)
                .set("Content-Type", "application/json")
                .timeout(Duration::from_secs(2))
                .send_string(&body)
                .is_ok();

            desenhar_dashboard(true, wincc_vivo, elapsed, backend_ok, primeira_vez);
            primeira_vez = false;
        }
    }
}
