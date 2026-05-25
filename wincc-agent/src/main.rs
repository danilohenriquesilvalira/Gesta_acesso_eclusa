// wincc-agent — Agente leve para Windows Server (RG/PN/Reserva01/...)
//
// Threads independentes, sem estado partilhado complexo:
//   A) HTTP server :8181  — recebe POST /wincc-alive do WinCC Global Script
//   B) heartbeat 1s       — POST /heartbeat/{servidor} (Windows vivo)
//   C) wincc-status 3s    — POST /wincc-status/{servidor} (WinCC vivo/morto)
//
// Config: C:\wincc-agent\config.json
//   { "api_url": "http://172.29.164.12:8080", "servidor": "RG" }
//
// Uso:
//   wincc-agent.exe --install   instala e inicia servico Windows
//   wincc-agent.exe --remove    para e remove servico
//   wincc-agent.exe --run       corre em foreground (teste)

#![windows_subsystem = "windows"]

use std::{
    ffi::OsString,
    io::{Read, Write},
    net::TcpListener,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use windows_service::{
    define_windows_service,
    service::{
        ServiceAccess, ServiceAction, ServiceActionType, ServiceControl,
        ServiceControlAccept, ServiceErrorControl, ServiceExitCode, ServiceFailureActions,
        ServiceFailureResetPeriod, ServiceInfo, ServiceStartType, ServiceState, ServiceStatus,
        ServiceType,
    },
    service_control_handler::{self, ServiceControlHandlerResult},
    service_dispatcher,
    service_manager::{ServiceManager, ServiceManagerAccess},
};

const SERVICE_NAME:  &str = "WinCCAgent";
const SERVICE_LABEL: &str = "WinCC Access Control Agent";
const WINCC_PORT:    u16  = 8181;
const WINCC_TIMEOUT_SECS: u64 = 10; // se não chegar alive em 10s → morto

// ── Config ────────────────────────────────────────────────────────────────────

fn load_config() -> (String, String) {
    let content = std::fs::read_to_string("C:\\wincc-agent\\config.json").unwrap_or_default();
    let v: serde_json::Value = serde_json::from_str(&content).unwrap_or_default();
    let api = v["api_url"].as_str().unwrap_or("http://172.29.164.12:8080").to_string();
    let srv = v["servidor"].as_str().unwrap_or("RG").to_string();
    (api, srv)
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}

// ── Thread A: mini HTTP server — recebe /wincc-alive do WinCC ────────────────

fn wincc_listener(stop: Arc<AtomicBool>, last_alive: Arc<AtomicU64>) {
    let listener = match TcpListener::bind(format!("127.0.0.1:{}", WINCC_PORT)) {
        Ok(l)  => l,
        Err(_) => return, // porta ocupada — ignora
    };
    listener.set_nonblocking(true).ok();

    loop {
        if stop.load(Ordering::Relaxed) { break; }

        match listener.accept() {
            Ok((mut stream, _)) => {
                stream.set_read_timeout(Some(Duration::from_millis(200))).ok();
                let mut buf = [0u8; 512];
                let n = stream.read(&mut buf).unwrap_or(0);
                let req = std::str::from_utf8(&buf[..n]).unwrap_or("");

                // Aceita qualquer POST para /wincc-alive
                if req.contains("POST") && req.contains("/wincc-alive") {
                    last_alive.store(now_secs(), Ordering::Relaxed);
                    let resp = "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK";
                    stream.write_all(resp.as_bytes()).ok();
                } else {
                    let resp = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
                    stream.write_all(resp.as_bytes()).ok();
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(_) => std::thread::sleep(Duration::from_millis(100)),
        }
    }
}

// ── Thread B: heartbeat Windows → backend (1s) ───────────────────────────────

fn heartbeat_loop(stop: Arc<AtomicBool>, api_url: String, servidor: String) {
    let url = format!("{}/heartbeat/{}", api_url, servidor);
    loop {
        if stop.load(Ordering::Relaxed) { break; }
        let _ = ureq::post(&url).timeout(Duration::from_secs(2)).send_string("");
        std::thread::sleep(Duration::from_secs(1));
    }
}

// ── Thread C: wincc-status → backend (3s) ────────────────────────────────────

fn wincc_status_loop(stop: Arc<AtomicBool>, api_url: String, servidor: String, last_alive: Arc<AtomicU64>) {
    let url = format!("{}/wincc-status/{}", api_url, servidor);
    loop {
        if stop.load(Ordering::Relaxed) { break; }

        let elapsed = now_secs().saturating_sub(last_alive.load(Ordering::Relaxed));
        let vivo = elapsed < WINCC_TIMEOUT_SECS;
        let body = format!("{{\"vivo\":{}}}", vivo);

        let _ = ureq::post(&url)
            .set("Content-Type", "application/json")
            .timeout(Duration::from_secs(2))
            .send_string(&body);

        std::thread::sleep(Duration::from_secs(3));
    }
}

// ── Loop principal ────────────────────────────────────────────────────────────

fn run(stop: Arc<AtomicBool>) {
    let (api_url, servidor) = load_config();
    let last_alive = Arc::new(AtomicU64::new(0));

    let t_listener = {
        let stop = stop.clone();
        let la   = last_alive.clone();
        std::thread::spawn(move || wincc_listener(stop, la))
    };

    let t_heartbeat = {
        let stop = stop.clone();
        let api  = api_url.clone();
        let srv  = servidor.clone();
        std::thread::spawn(move || heartbeat_loop(stop, api, srv))
    };

    let t_status = {
        let stop = stop.clone();
        let api  = api_url.clone();
        let srv  = servidor.clone();
        let la   = last_alive.clone();
        std::thread::spawn(move || wincc_status_loop(stop, api, srv, la))
    };

    t_listener.join().ok();
    t_heartbeat.join().ok();
    t_status.join().ok();
}

// ── Serviço Windows ───────────────────────────────────────────────────────────

define_windows_service!(ffi_service_main, service_main);

fn service_main(_args: Vec<OsString>) {
    let stop     = Arc::new(AtomicBool::new(false));
    let stop_svc = stop.clone();

    let handle = service_control_handler::register(SERVICE_NAME, move |ctrl| {
        match ctrl {
            ServiceControl::Stop | ServiceControl::Shutdown => {
                stop_svc.store(true, Ordering::Relaxed);
                ServiceControlHandlerResult::NoError
            }
            ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
            _ => ServiceControlHandlerResult::NotImplemented,
        }
    }).expect("register falhou");

    handle.set_service_status(ServiceStatus {
        service_type:      ServiceType::OWN_PROCESS,
        current_state:     ServiceState::Running,
        controls_accepted: ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
        exit_code:         ServiceExitCode::Win32(0),
        checkpoint:        0,
        wait_hint:         Duration::default(),
        process_id:        None,
    }).expect("set_status falhou");

    run(stop);

    handle.set_service_status(ServiceStatus {
        service_type:      ServiceType::OWN_PROCESS,
        current_state:     ServiceState::Stopped,
        controls_accepted: ServiceControlAccept::empty(),
        exit_code:         ServiceExitCode::Win32(0),
        checkpoint:        0,
        wait_hint:         Duration::default(),
        process_id:        None,
    }).ok();
}

// ── main ─────────────────────────────────────────────────────────────────────

fn main() {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(|s| s.as_str()).unwrap_or("") {
        "--install" => install_service(),
        "--remove"  => remove_service(),
        "--run"     => {
            let stop = Arc::new(AtomicBool::new(false));
            run(stop);
        }
        _ => {
            service_dispatcher::start(SERVICE_NAME, ffi_service_main)
                .expect("dispatcher falhou");
        }
    }
}

fn install_service() {
    let mgr = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CREATE_SERVICE)
        .expect("abrir SCM falhou");
    let exe = std::env::current_exe().expect("exe path falhou");

    let svc = mgr.create_service(&ServiceInfo {
        name:             OsString::from(SERVICE_NAME),
        display_name:     OsString::from(SERVICE_LABEL),
        service_type:     ServiceType::OWN_PROCESS,
        start_type:       ServiceStartType::AutoStart,
        error_control:    ServiceErrorControl::Normal,
        executable_path:  exe,
        launch_arguments: vec![],
        dependencies:     vec![],
        account_name:     None,
        account_password: None,
    }, ServiceAccess::CHANGE_CONFIG | ServiceAccess::START)
    .expect("criar servico falhou");

    svc.update_failure_actions(ServiceFailureActions {
        reset_period: ServiceFailureResetPeriod::After(Duration::from_secs(86400)),
        reboot_msg:   None,
        command:      None,
        actions: Some(vec![
            ServiceAction { action_type: ServiceActionType::Restart, delay: Duration::from_secs(2)  },
            ServiceAction { action_type: ServiceActionType::Restart, delay: Duration::from_secs(5)  },
            ServiceAction { action_type: ServiceActionType::Restart, delay: Duration::from_secs(10) },
        ]),
    }).ok();
    svc.set_failure_actions_on_non_crash_failures(true).ok();
    svc.start(&[] as &[&str]).expect("iniciar servico falhou");
}

fn remove_service() {
    let mgr = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)
        .expect("abrir SCM falhou");
    let svc = mgr.open_service(SERVICE_NAME, ServiceAccess::STOP | ServiceAccess::DELETE)
        .expect("servico nao encontrado");
    svc.stop().ok();
    std::thread::sleep(Duration::from_secs(2));
    svc.delete().expect("remover servico falhou");
}
