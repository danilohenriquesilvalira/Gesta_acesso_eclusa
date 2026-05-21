use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub api_url:      String,
    pub rdp_user:     String,
    pub rdp_password: String,
    pub ip_cliente1:  String,
    pub ip_cliente2:  String,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            api_url:      "http://172.29.164.10:8080".to_string(),
            rdp_user:     "Administrator".to_string(),
            rdp_password: String::new(),
            ip_cliente1:  "172.29.164.49".to_string(),
            ip_cliente2:  "172.29.164.51".to_string(),
        }
    }
}

pub fn load_config() -> Config {
    let candidates = [
        std::env::current_exe().ok()
            .and_then(|p| p.parent().map(|d| d.join("config.json"))),
        std::env::current_dir().ok().map(|d| d.join("config.json")),
        std::env::current_exe().ok()
            .and_then(|p| p.parent()?.parent()?.parent().map(|d| d.join("config.json"))),
    ];
    for path in candidates.into_iter().flatten() {
        if let Ok(txt) = std::fs::read_to_string(&path) {
            if let Ok(cfg) = serde_json::from_str::<Config>(&txt) {
                return cfg;
            }
        }
    }
    Config::default()
}

#[tauri::command]
pub fn get_config() -> Config {
    load_config()
}
