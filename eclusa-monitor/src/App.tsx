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
import AdminSidebar      from "./components/admin/AdminSidebar";

import { useAuth }   from "./hooks/useAuth";
import { useEstado } from "./hooks/useEstado";
import { useRdp }    from "./hooks/useRdp";
import type { ClienteKey, Eclusa, Pagina, RdpInfo, Sessao, Supervisao } from "./types";

// ── Constantes ────────────────────────────────────────────────────────────────

const DEFAULT_API = "http://172.29.164.12:8080";

const ECLUSA_CLIENTE: Record<string, ClienteKey> = {
  RG: "cliente1",
  PN: "cliente2",
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
  const [failoverInfo,  setFailoverInfo]  = useState<{ cliente: string; ip_reserva: string } | null>(null);

  const { username, token, isAdmin, login, logout } = useAuth();

  // onFailoverSse via ref — quebra dependência circular useRdp ↔ useEstado
  const onFailoverRef = useRef<((p: { cliente: string; ip_reserva: string }) => void) | undefined>(undefined);
  const onFailoverStable = useCallback((p: { cliente: string; ip_reserva: string }) => {
    setFailoverInfo(p);
    onFailoverRef.current?.(p);
  }, []);

  const { estado, apiOk, fetchEstado } = useEstado(apiUrl, ipReserva, onFailoverStable);

  const {
    conectando, emSupervisao, erro, setErro,
    handleConectar, handleEncerrar, handleAdminEncerrar, handleSupervisao, handleSairSupervisao,
    onFailoverSse,
  } = useRdp({ apiUrl, token, username, estado, fetchEstado, onNeedLogin: () => setLoginAberto(true), ipCliente1, ipCliente2, ipReserva });

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
    estado?.sessoes[k] ?? { operador: "", timestamp_inicio: "", conectado: false };
  const rdpInfo    = (k: ClienteKey): RdpInfo =>
    estado?.rdp?.[k]  ?? { ocupado: false, utilizador: "", verificado: false, timestamp: "", nao_autorizado: false };
  const eclusa     = (key: string): Eclusa | undefined =>
    estado?.eclusas?.eclusas?.[key];
  const supervisoes = (k: ClienteKey): Supervisao[] =>
    estado?.supervisoes?.[k] ?? [];

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
                  nomeCliente={cliente ? (cliente === "cliente1" ? ipCliente1 : ipCliente2) : "Posto Indisponível"}
                  sessao={cliente ? sessao(cliente) : { operador: "", timestamp_inicio: "", conectado: false }}
                  rdp={cliente ? rdpInfo(cliente) : { ocupado: false, utilizador: "", verificado: false, timestamp: "", nao_autorizado: false }}
                  conectando={cliente ? conectando === cliente : false}
                  ehAdmin={isAdmin} backendOnline={backendOnline}
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

  const nomeCliente = failoverInfo?.cliente === "cliente1" ? "RG" : failoverInfo?.cliente === "cliente2" ? "PN" : failoverInfo?.cliente ?? "";

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
      {failoverInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}>
          <div className="bg-[#1a2435] border border-[#E32C2C]/40 rounded-3xl shadow-2xl px-10 py-8 flex flex-col items-center gap-5 max-w-sm w-full mx-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "rgba(227,44,44,0.15)" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E32C2C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-white font-black text-xl mb-1">Servidor Inacessível</p>
              <p className="text-white/50 text-sm">Servidor <span className="text-white font-bold">{nomeCliente}</span> caiu — a redirecionar para servidor reserva</p>
              <p className="text-[#28FF52] font-mono font-bold text-sm mt-2">{failoverInfo.ip_reserva}</p>
            </div>
            <div className="flex items-center gap-2 text-white/40 text-xs">
              <div className="w-4 h-4 border-2 border-white/20 border-t-[#28FF52] rounded-full animate-spin" />
              A ligar ao servidor reserva...
            </div>
            <button
              onClick={() => setFailoverInfo(null)}
              className="text-white/30 text-xs hover:text-white/60 transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  );

  // ── Layout Admin (sidebar) ────────────────────────────────────────────────────

  if (isAdmin && username) {
    const adminContent =
      pagina === "admin-usuarios" ? <AdminUtilizadores apiUrl={apiUrl} token={token} />
      : pagina === "admin-logs"   ? <AdminLogs         apiUrl={apiUrl} token={token} />
      : pagina === "admin-blacklist" ? <AdminBlacklist apiUrl={apiUrl} token={token} />
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
      />
      {dashboardContent}
      {dialogs}
    </div>
  );
}
