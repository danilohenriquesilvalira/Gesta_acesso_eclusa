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

export interface Estado {
  sessoes:     { cliente1: Sessao; cliente2: Sessao };
  rdp:         { cliente1: RdpInfo; cliente2: RdpInfo };
  eclusas:     { timestamp: string; eclusas: { [k: string]: Eclusa } };
  supervisoes: { cliente1: Supervisao[]; cliente2: Supervisao[] };
  operadores:  string[];
  plc_health:  Record<string, PlcHealth>;
  timestamp:   string;
}

export type ClienteKey = "cliente1" | "cliente2";
export type Pagina     = "dashboard" | "admin-usuarios" | "admin-logs" | "admin-blacklist" | "rede";
