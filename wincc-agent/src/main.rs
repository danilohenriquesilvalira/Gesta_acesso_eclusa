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

fn load_config() -> (String, String) {
    let bytes = std::fs::read("C:\\wincc-agent\\config.json").unwrap_or_default();
    // Remove BOM UTF-8 (EF BB BF) que o PowerShell 5 adiciona automaticamente
    let content = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        String::from_utf8_lossy(&bytes[3..]).into_owned()
    } else {
        String::from_utf8_lossy(&bytes).into_owned()
    };
    let v: serde_json::Value = serde_json::from_str(&content).unwrap_or_default();
    let api = v["api_url"].as_str().unwrap_or("http://172.29.164.12:8080").to_string();
    let srv = v["servidor"].as_str().unwrap_or("RG").to_string();
    (api, srv)
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

    let (api_url, servidor) = load_config();
    let last_alive  = Arc::new(AtomicU64::new(0));
    let last_bit    = Arc::new(AtomicU64::new(0)); // bit devolvido ao WinCC (0 ou 1)
    let stop        = Arc::new(AtomicBool::new(false));

    println!("╔══════════════════════════════════════════════════╗");
    println!("║         WinCC Agent — Controlo de Acesso         ║");
    println!("╠══════════════════════════════════════════════════╣");
    println!("║  Servidor : {:<38}║", servidor);
    println!("║  API      : {:<38}║", api_url);
    println!("║  Porta    : {:<38}║", WINCC_PORT);
    println!("╚══════════════════════════════════════════════════╝");
    println!();

    // Thread A: recebe /wincc-alive, inverte bit e devolve ao WinCC
    {
        let stop    = stop.clone();
        let la      = last_alive.clone();
        let lb      = last_bit.clone();
        std::thread::spawn(move || {
            match TcpListener::bind(format!("127.0.0.1:{}", WINCC_PORT)) {
                Ok(listener) => {
                    listener.set_nonblocking(true).ok();
                    loop {
                        if stop.load(Ordering::Relaxed) { break; }
                        match listener.accept() {
                            Ok((mut stream, _)) => {
                                stream.set_read_timeout(Some(Duration::from_millis(200))).ok();
                                let mut buf = [0u8; 512];
                                let n = stream.read(&mut buf).unwrap_or(0);
                                let req = std::str::from_utf8(&buf[..n]).unwrap_or("");
                                if req.contains("POST") && req.contains("/wincc-alive") {
                                    la.store(now_secs(), Ordering::Relaxed);
                                    // Inverte o bit para devolver ao WinCC
                                    let bit = if lb.load(Ordering::Relaxed) == 0 { 1u64 } else { 0u64 };
                                    lb.store(bit, Ordering::Relaxed);
                                    // Resposta com o bit actual para o VBScript ler
                                    let body = format!("{{\"life_bit\":{}}}", bit);
                                    let resp = format!(
                                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                                        body.len(), body
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

        // Reserva as 3 linhas do dashboard
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
