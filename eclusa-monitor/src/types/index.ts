// ── Domain types — shared across all components ───────────────────────────────

export interface Sessao {
  operador:         string;
  timestamp_inicio: string;
  conectado:        boolean;
}

export interface Eclusa {
  status:  number;
  modo:    string;
  posto:   string;
  usuario: string;
}

export interface RdpInfo {
  ocupado:        boolean;
  utilizador:     string;
  verificado:     boolean;
  timestamp:      string;
  nao_autorizado: boolean;
}

export interface Supervisao {
  supervisor: string;
  timestamp:  string;
}

export interface PlcHealth {
  id:               string;
  ip:               string;
  eclusa_code:      string;
  status:           "online" | "degraded" | "offline";
  consecutive_fails: number;
  last_check:       string;
}

export interface ServidorHealth {
  servidor:         string;
  ip:               string;
  windows_vivo:     boolean;
  wincc_vivo:       boolean;
  ultimo_heartbeat: string;
  ultimo_wincc:     string;
}

export interface Estado {
  sessoes:          { eclusa_RG: Sessao; eclusa_PN: Sessao };
  rdp:              { eclusa_RG: RdpInfo; eclusa_PN: RdpInfo };
  eclusas:          { timestamp: string; eclusas: { [k: string]: Eclusa } };
  supervisoes:      { eclusa_RG: Supervisao[]; eclusa_PN: Supervisao[] };
  operadores:       string[];
  plc_health:       Record<string, PlcHealth>;
  servidor_health:  Record<string, ServidorHealth>;
  timestamp:        string;
}

export type ClienteKey = "eclusa_RG" | "eclusa_PN";
export type Pagina     = "dashboard" | "admin-usuarios" | "admin-logs" | "admin-blacklist" | "admin-servidores" | "rede";
