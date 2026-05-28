import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

import Header            from "./components/layout/Header";
import StatusBar         from "./components/layout/StatusBar";
import LoginDialog       from "./components/auth/LoginDialog";
import EclusaAcessoCard  from "./components/eclusa/EclusaAcessoCard";
import EclusaMonitorCard from "./components/eclusa/EclusaMonitorCard";
import AdminUtilizadores from "./components/admin/AdminUtilizadores";
import AdminLogs         from "./components/admin/AdminLogs";
import AdminBlacklist    from "./components/admin/AdminBlacklist";
import AdminServidores   from "./components/admin/AdminServidores";
import AdminSidebar      from "./components/admin/AdminSidebar";

import { useAuth }   from "./hooks/useAuth";
import { useEstado } from "./hooks/useEstado";
import { useRdp }    from "./hooks/useRdp";
import type { ClienteKey, Eclusa, Pagina, RdpInfo, Sessao, Supervisao } from "./types";
import type { VoltouPayload } from "./hooks/useEstado";

// ── Constantes ────────────────────────────────────────────────────────────────

const DEFAULT_API = "http://172.29.164.12:8080";

const ECLUSA_CLIENTE: Record<string, ClienteKey> = {
  RG: "eclusa_RG",
  PN: "eclusa_PN",
};

const ECLUSA_KEYS = ["IND1", "IND2", "RG", "IND4", "PN"] as const;

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [pagina,        setPagina]        = useState<Pagina>("dashboard");
  const [loginAberto,   setLoginAberto]   = useState(false);
  const [apiUrl,        setApiUrl]        = useState(DEFAULT_API);
  const [ipCliente1,    setIpCliente1]    = useState("172.29.164.13");
  const [ipCliente2,    setIpCliente2]    = useState("172.29.164.14");
  const [ipReserva,     setIpReserva]     = useState("172.29.164.15");
  const [voltouInfo,    setVoltouInfo]    = useState<VoltouPayload | null>(null);
  // Rastreia qual cliente está a usar reserva: "cliente1" -> "Reserva01"
  const [emReservaMap, setEmReservaMap] = useState<Record<string, string>>({});

  const { username, token, isAdmin, login, logout } = useAuth();

  // refs para acesso dentro de callbacks sem dependências estáticas
  const tokenRef  = useRef(token);
  const apiUrlRef = useRef(apiUrl);
  useEffect(() => { tokenRef.current  = token;  }, [token]);
  useEffect(() => { apiUrlRef.current = apiUrl; }, [apiUrl]);

  // onFailoverSse via ref — quebra dependência circular useRdp ↔ useEstado
  const onFailoverRef        = useRef<((p: { cliente: string; ip_reserva: string }) => void) | undefined>(undefined);
  // handleVoltarOriginal via ref — precisa estar declarado antes de onVoltouStable
  const onVoltarOriginalRef  = useRef<((cliente: import("./types").ClienteKey, ipOriginal: string) => Promise<void>) | undefined>(undefined);

  const onFailoverStable = useCallback((p: { cliente: string; ip_reserva: string; id_reserva?: string }) => {
    if (p.id_reserva) {
      const clienteKey = ECLUSA_CLIENTE[p.cliente] ?? p.cliente;
      setEmReservaMap(prev => ({ ...prev, [clienteKey]: p.id_reserva! }));
    }
    onFailoverRef.current?.(p);
  }, []);

  const usernameRef = useRef(username);
  useEffect(() => { usernameRef.current = username; }, [username]);

  const onVoltouStable = useCallback((p: VoltouPayload) => {
    if (p.reconectar_auto && p.cliente_key) {
      // Só o PC do operador original reconecta — compara operador do backend com username local.
      // Outros PCs (admins, outros operadores) ignoram este evento.
      const operadorLocal = usernameRef.current;
      if (!operadorLocal || !p.operador) return;
      if (p.operador.toLowerCase() !== operadorLocal.toLowerCase()) return;

      // handleVoltarOriginal: fecha mstsc do reserva, regista sessão no original, abre mstsc no original
      const clienteKey = (ECLUSA_CLIENTE[p.cliente_key] ?? p.cliente_key) as import("./types").ClienteKey;
      onVoltarOriginalRef.current?.(clienteKey, p.ip_original);
      // Remove do mapa de reserva
      setEmReservaMap(prev => {
        const next = { ...prev };
        delete next[clienteKey];
        return next;
      });
    } else {
      // Sem sessão ativa no reserva — limpa badge de reserva e notifica visualmente
      if (p.cliente_key) {
        const clienteKey = (ECLUSA_CLIENTE[p.cliente_key] ?? p.cliente_key) as import("./types").ClienteKey;
        setEmReservaMap(prev => {
          const next = { ...prev };
          delete next[clienteKey];
          return next;
        });
      }
      setVoltouInfo(p);
    }
  }, []);

  const { estado, servidorHealth, apiOk, fetchEstado } = useEstado(apiUrl, ipReserva, onFailoverStable, onVoltouStable, token);

  const onFailoverManual = useCallback((cliente: string, idReserva: string, _ipR: string) => {
    const clienteKey = ECLUSA_CLIENTE[cliente] ?? cliente;
    setEmReservaMap(prev => ({ ...prev, [clienteKey]: idReserva }));
  }, []);

  const onLimparReserva = useCallback((cliente: import("./types").ClienteKey) => {
    setEmReservaMap(prev => {
      const next = { ...prev };
      delete next[cliente];
      return next;
    });
  }, []);

  const {
    conectando, emSupervisao, erro, setErro,
    handleConectar, handleEncerrar, handleAdminEncerrar, handleSupervisao, handleSairSupervisao,
    onFailoverSse, handleVoltarOriginal,
  } = useRdp({ apiUrl, token, username, estado, fetchEstado, onNeedLogin: () => setLoginAberto(true), ipCliente1, ipCliente2, ipReserva, servidorHealth, onFailoverManual, onLimparReserva });

  // Liga onVoltarOriginalRef ao handler real depois de useRdp estar pronto
  useEffect(() => { onVoltarOriginalRef.current = handleVoltarOriginal; }, [handleVoltarOriginal]);

  // Liga o ref ao handler real depois de useRdp estar pronto
  useEffect(() => { onFailoverRef.current = onFailoverSse; }, [onFailoverSse]);

  // Config Tauri — lê config.json (api_url + IPs dos clientes RDP)
  useEffect(() => {
    invoke<{ api_url: string; ip_cliente1: string; ip_cliente2: string; ip_reserva?: string }>("get_config")
      .then(c => {
        setApiUrl(c.api_url);
        if (c.ip_cliente1) setIpCliente1(c.ip_cliente1);
        if (c.ip_cliente2) setIpCliente2(c.ip_cliente2);
        if (c.ip_reserva)  setIpReserva(c.ip_reserva);
      })
      .catch(() => {});
  }, []);

  // ── Helpers de leitura do estado ─────────────────────────────────────────────

  const sessao     = (k: ClienteKey): Sessao =>
    (estado?.sessoes as Record<string, Sessao>)?.[k] ?? { operador: "", timestamp_inicio: "", conectado: false };
  const rdpInfo    = (k: ClienteKey): RdpInfo =>
    (estado?.rdp as Record<string, RdpInfo>)?.[k]  ?? { ocupado: false, utilizador: "", verificado: false, timestamp: "", nao_autorizado: false };
  const eclusa     = (key: string): Eclusa | undefined =>
    estado?.eclusas?.eclusas?.[key];
  const supervisoes = (k: ClienteKey): Supervisao[] =>
    (estado?.supervisoes as Record<string, Supervisao[]>)?.[k] ?? [];

  // true enquanto não houver confirmação de falha; false quando sabemos que está offline
  const backendOnline = apiOk !== false;

  // ── Dashboard content (partilhado entre layouts) ─────────────────────────────

  const dashboardContent = (
    <>
      <main className="flex-1 flex flex-col gap-3 px-6 py-4 min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-4 rounded-full" style={{ background: "#212E3E" }} />
            <span className="text-[11px] font-extrabold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.45)" }}>
              Acesso Remoto — WinCC Servidores
            </span>
          </div>
          <div className="grid grid-cols-5 gap-4 flex-1 min-h-0">
            {ECLUSA_KEYS.map(key => {
              const cliente = ECLUSA_CLIENTE[key as keyof typeof ECLUSA_CLIENTE];
              return (
                <EclusaAcessoCard key={key} nomeEclusa={key}
                  nomeCliente={cliente ? (cliente === "eclusa_RG" ? ipCliente1 : ipCliente2) : "Posto Indisponível"}
                  sessao={cliente ? sessao(cliente) : { operador: "", timestamp_inicio: "", conectado: false }}
                  rdp={cliente ? rdpInfo(cliente) : { ocupado: false, utilizador: "", verificado: false, timestamp: "", nao_autorizado: false }}
                  conectando={cliente ? conectando === cliente : false}
                  ehAdmin={isAdmin} backendOnline={backendOnline}
                  emReserva={cliente ? emReservaMap[cliente] : undefined}
                  onConectar={() => cliente && handleConectar(cliente)}
                  onEncerrar={() => cliente && handleEncerrar(cliente)}
                  onForcarEncerrar={() => cliente && handleAdminEncerrar(cliente)}
                  utilizadorAtual={username}
                />
              );
            })}
          </div>
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-4 rounded-full" style={{ background: "#225E66" }} />
            <span className="text-[11px] font-extrabold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.45)" }}>
              Monitoramento — Estado das Eclusas WinCC
            </span>
            {estado?.eclusas?.timestamp && (
              <span className="text-[10px] font-mono ml-auto" style={{ color: "rgba(255,255,255,0.2)" }}>
                {estado.eclusas.timestamp}
              </span>
            )}
          </div>
          <div className="grid grid-cols-5 gap-4 flex-1 min-h-0">
            {ECLUSA_KEYS.map(key => {
              const cliente = ECLUSA_CLIENTE[key as keyof typeof ECLUSA_CLIENTE];
              return (
                <EclusaMonitorCard key={key} nome={key} eclusa={eclusa(key)}
                  ehAdmin={!!username} backendOnline={backendOnline}
                  servidorAcessivel={cliente ? rdpInfo(cliente).verificado : false}
                  sessaoAtiva={cliente ? (sessao(cliente).conectado || rdpInfo(cliente).ocupado) : false}
                  emSupervisao={cliente ? emSupervisao === cliente : false}
                  supervisoesAtivas={cliente ? supervisoes(cliente) : []}
                  utilizadorAtual={username}
                  onSupervisao={() => cliente && handleSupervisao(cliente)}
                  onSairSupervisao={handleSairSupervisao}
                />
              );
            })}
          </div>
        </div>
        {apiOk === null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            <p className="text-white/40 text-sm font-semibold">A ligar ao servidor...</p>
          </div>
        )}
      </main>
      <StatusBar apiUrl={apiUrl} apiOk={apiOk} />
    </>
  );

  // ── Diálogos e erros (partilhados) ────────────────────────────────────────────

  const dialogs = (
    <>
      <LoginDialog isOpen={loginAberto} canClose={true} apiUrl={apiUrl}
        onLogin={(u, tok, r) => { login(u, tok, r); setLoginAberto(false); }}
        onClose={() => setLoginAberto(false)}
      />
      {erro && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white border border-[#E32C2C]/30 shadow-2xl text-[#E32C2C] px-5 py-3 rounded-2xl text-sm font-bold cursor-pointer z-50"
          onClick={() => setErro("")}>
          <span className="text-base">&#9888;</span>
          {erro}
          <span className="ml-2 text-[#E32C2C]/50 font-mono text-xs">&#x2715;</span>
        </div>
      )}
      {voltouInfo && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl cursor-pointer"
          style={{ background: "#1a2435", border: "1px solid rgba(40,255,82,0.3)" }}
          onClick={() => setVoltouInfo(null)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#28FF52" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <span className="text-white font-bold text-sm">Servidor <span style={{ color: "#28FF52" }}>{voltouInfo.servidor}</span> restabelecido</span>
          <span className="text-white/30 font-mono text-xs ml-2">&#x2715;</span>
        </div>
      )}
    </>
  );

  // ── Layout Admin (sidebar) ────────────────────────────────────────────────────

  if (isAdmin && username) {
    const adminContent =
      pagina === "admin-usuarios"   ? <AdminUtilizadores apiUrl={apiUrl} token={token} />
      : pagina === "admin-logs"     ? <AdminLogs         apiUrl={apiUrl} token={token} />
      : pagina === "admin-blacklist"   ? <AdminBlacklist    apiUrl={apiUrl} token={token} />
      : pagina === "admin-servidores"  ? <AdminServidores   servidorHealth={servidorHealth} rdp={estado?.rdp} sessoes={estado?.sessoes} token={token} />
      : dashboardContent;

    return (
      <div className="h-screen flex overflow-hidden font-sans">
        <AdminSidebar
          pagina={pagina}
          onPagina={setPagina}
          utilizador={username}
          onSair={() => { logout(); setPagina("dashboard"); }}
        />
        <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "#212E3E" }}>
          {adminContent}
        </div>
        {dialogs}
      </div>
    );
  }

  // ── Layout Operador (header + dashboard fullscreen) ──────────────────────────

  return (
    <div className="h-screen flex flex-col overflow-hidden font-sans" style={{ background: "#212E3E" }}>
      <Header
        utilizador={username}
        isAdmin={false}
        apiOk={apiOk}
        pagina={pagina}
        onPagina={setPagina}
        onLoginClick={() => setLoginAberto(true)}
        onSair={() => { logout(); setPagina("dashboard"); }}
        servidorHealth={servidorHealth}
      />
      {dashboardContent}
      {dialogs}
    </div>
  );
}
