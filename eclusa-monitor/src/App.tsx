import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Header             from "./components/layout/Header";
import StatusBar           from "./components/layout/StatusBar";
import LoginDialog         from "./components/auth/LoginDialog";
import EclusaAcessoCard    from "./components/eclusa/EclusaAcessoCard";
import EclusaMonitorCard   from "./components/eclusa/EclusaMonitorCard";
import AdminUtilizadores   from "./components/admin/AdminUtilizadores";
import AdminLogs           from "./components/admin/AdminLogs";
import RedeAnalise         from "./components/RedeAnalise";

// ── Tipos exportados ──────────────────────────────────────────────────────────

export interface Sessao {
  operador:         string;
  timestamp_inicio: string;
  conectado:        boolean;
}

export interface Eclusa {
  status: number;
  modo:   string;
  posto:  string;
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

export interface Estado {
  sessoes:     { cliente1: Sessao; cliente2: Sessao };
  rdp:         { cliente1: RdpInfo; cliente2: RdpInfo };
  eclusas:     { timestamp: string; eclusas: { [k: string]: Eclusa } };
  supervisoes: { cliente1: Supervisao[]; cliente2: Supervisao[] };
  operadores:  string[];
  timestamp:   string;
}

type ClienteKey = "cliente1" | "cliente2";
type Pagina     = "dashboard" | "admin-usuarios" | "admin-logs" | "rede";
interface Config { api_url: string }

// ── Constantes ────────────────────────────────────────────────────────────────

const DEFAULT_API = "http://172.29.164.10:8080";

// IPs dos servidores WinCC
const CLIENTES: Record<ClienteKey, { nome: string; ip: string }> = {
  cliente1: { nome: "WinCC Cliente 1", ip: "172.29.164.49" },
  cliente2: { nome: "WinCC Cliente 2", ip: "172.29.164.51" },
};

// Mapeamento de cada eclusa ao servidor WinCC que a controla
const ECLUSA_CLIENTE: Record<string, ClienteKey> = {
  RG: "cliente1", // Posto 1 - Régua (172.29.164.49)
  PN: "cliente2", // Posto 2 - Pocinho (172.29.164.51)
};

const ECLUSA_KEYS = ["IND1", "IND2", "RG", "IND4", "PN"] as const;

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [pagina,      setPagina]      = useState<Pagina>("dashboard");
  const [utilizador,  setUtilizador]  = useState("");
  const [loginAberto, setLoginAberto] = useState(false);
  const [semUsers,    setSemUsers]    = useState(false);

  const [estado,     setEstado]     = useState<Estado | null>(null);
  const [apiUrl,     setApiUrl]     = useState(DEFAULT_API);
  const [apiOk,      setApiOk]      = useState<boolean | null>(null);
  const [agora,      setAgora]      = useState(new Date());
  const [erro,       setErro]       = useState("");
  const [conectando,   setConectando]   = useState<ClienteKey | null>(null);
  const [emSupervisao, setEmSupervisao] = useState<ClienteKey | null>(null);

  const ehAdmin = !!utilizador;

  // Config Tauri
  useEffect(() => {
    invoke<Config>("get_config").then(c => setApiUrl(c.api_url)).catch(() => {});
  }, []);

  // Verificar se há utilizadores
  useEffect(() => {
    fetch(`${apiUrl}/usuarios`)
      .then(r => r.json())
      .then((l: unknown[]) => setSemUsers(l.length === 0))
      .catch(() => {});
  }, [apiUrl]);

  // Relógio
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch estado
  const fetchEstado = useCallback(() => {
    fetch(`${apiUrl}/estado`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() as Promise<Estado>; })
      .then(d => { setEstado(d); setApiOk(true); })
      .catch(() => setApiOk(false));
  }, [apiUrl]);

  // Encerrar sessão RDP — limpa estado imediatamente (sem esperar pela API)
  const handleEncerrar = useCallback(async (cliente: ClienteKey) => {
    // Limpa sessão imediatamente na UI — supervisão fica intacta até API confirmar
    setEstado(prev => prev ? {
      ...prev,
      sessoes: { ...prev.sessoes, [cliente]: { operador: "", timestamp_inicio: "", conectado: false } },
    } : prev);

    try { await invoke("fechar_rdp"); } catch { /* ignora */ }
    try {
      await fetch(`${apiUrl}/sessoes/encerrar`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ cliente }),
      });
      fetchEstado();
    } catch { /* ignora */ }
  }, [apiUrl, fetchEstado]);

  // SSE + fallback polling
  useEffect(() => {
    fetchEstado();
    const es = new EventSource(`${apiUrl}/eventos`);
    es.onmessage = (e) => {
      try { setEstado(JSON.parse(e.data) as Estado); setApiOk(true); } catch { /* ignore */ }
    };
    es.onerror = () => setApiOk(false);
    const t = setInterval(fetchEstado, 15000);
    return () => { es.close(); clearInterval(t); };
  }, [apiUrl, fetchEstado]);

  // Evento mstsc operação fechado → encerrar sessão
  useEffect(() => {
    const unlisten = listen<string>("rdp-desconectado", event => {
      handleEncerrar(event.payload as ClienteKey);
    });
    return () => { unlisten.then(fn => fn()); };
  }, [handleEncerrar]);

  // Evento shadow fechado → encerrar supervisão na API e limpar estado local
  useEffect(() => {
    const unlisten = listen<string>("shadow-fechado", event => {
      const cliente = event.payload as ClienteKey;
      fetch(`${apiUrl}/supervisao/encerrar`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ cliente }),
      }).catch(() => {});
      setEmSupervisao(null);
    });
    return () => { unlisten.then(fn => fn()); };
  }, [apiUrl]);


  // ── Handlers ────────────────────────────────────────────────────────────────

  const sessao     = (k: ClienteKey): Sessao     => estado?.sessoes[k]      ?? { operador: "", timestamp_inicio: "", conectado: false };
  const rdpInfo    = (k: ClienteKey): RdpInfo    => estado?.rdp?.[k]        ?? { ocupado: false, utilizador: "", verificado: false, timestamp: "", nao_autorizado: false };
  const eclusa     = (key: string): Eclusa | undefined => estado?.eclusas?.eclusas?.[key];
  const supervisoes = (k: ClienteKey): Supervisao[] => estado?.supervisoes?.[k] ?? [];

  const handleConectar = async (cliente: ClienteKey) => {
    if (!utilizador) { setLoginAberto(true); return; }
    if (conectando) return;

    const rdp = rdpInfo(cliente);
    if (rdp.ocupado) {
      const quem = sessao(cliente).operador || rdp.utilizador || "alguém";
      setErro(`Sessão RDP ativa em ${CLIENTES[cliente].nome} — ${quem}`);
      return;
    }

    const outro: ClienteKey = cliente === "cliente1" ? "cliente2" : "cliente1";
    const outra = sessao(outro);
    if (outra.conectado && outra.operador.toLowerCase() === utilizador.toLowerCase()) {
      setErro(`Já tens uma sessão ativa em ${CLIENTES[outro].nome}. Encerra primeiro.`);
      return;
    }

    setConectando(cliente);
    try {
      const r = await fetch(`${apiUrl}/sessoes/iniciar`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ cliente, operador: utilizador }),
      });
      const data = await r.json();
      if (!data.ok) { setErro(data.erro ?? "Erro ao registar sessão."); return; }
      fetchEstado();
      const msg = await invoke<string>("connect_rdp", { ip: CLIENTES[cliente].ip, cliente });
      if (msg) { setErro(msg); return; }
    } catch {
      setErro("Erro ao contactar a API.");
    } finally {
      setConectando(null);
    }
  };

  const handleSupervisao = async (cliente: ClienteKey) => {
    if (!utilizador) { setLoginAberto(true); return; }

    const rollback = () => fetch(`${apiUrl}/supervisao/encerrar`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ cliente }),
    }).catch(() => {});

    let registado = false;
    try {
      // API valida interlocks e devolve o session_id correcto
      const r = await fetch(`${apiUrl}/supervisao/iniciar`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ cliente, supervisor: utilizador }),
      });
      const data = await r.json();
      if (!data.ok) { setErro(data.erro ?? "Sem sessão activa para supervisionar."); return; }

      registado = true;
      const sessaoId: number = data.sessao_id ?? 0;
      if (!sessaoId) { rollback(); setErro("Session ID inválido — refresca o estado."); return; }

      // Lança mstsc /shadow com o session_id fornecido pela API
      const msg = await invoke<string>("connect_shadow", { cliente, sessaoId });
      if (msg) { rollback(); setErro(msg); return; }

      setEmSupervisao(cliente);
    } catch (e) {
      if (registado) rollback();
      setErro(`Erro supervisão: ${String(e)}`);
    }
  };

  const handleSairSupervisao = async () => {
    if (emSupervisao) {
      fetch(`${apiUrl}/supervisao/encerrar`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ cliente: emSupervisao, supervisor: utilizador }),
      }).catch(() => {});
    }
    try { await invoke("fechar_shadow"); } catch { /* ignora */ }
    setEmSupervisao(null);
  };

  // ── Página de Rede & Latência ────────────────────────────────────────────────

  if (pagina === "rede") {
    return (
      <div className="h-screen flex flex-col overflow-hidden font-sans" style={{ background: "#212E3E" }}>
        <Header
          utilizador={utilizador}
          ehAdmin={ehAdmin}
          agora={agora}
          apiOk={apiOk}
          pagina={pagina}
          onPagina={setPagina}
          onLoginClick={() => setLoginAberto(true)}
          onSair={() => { setUtilizador(""); setPagina("dashboard"); }}
        />
        <RedeAnalise />
      </div>
    );
  }

  // ── Páginas admin ────────────────────────────────────────────────────────────

  if (pagina === "admin-utilizadores" as Pagina || pagina === "admin-usuarios" || pagina === "admin-logs") {
    return (
      <div className="h-screen flex flex-col overflow-hidden font-sans" style={{ background: "#212E3E" }}>
        <Header
          utilizador={utilizador}
          ehAdmin={ehAdmin}
          agora={agora}
          apiOk={apiOk}
          pagina={pagina}
          onPagina={setPagina}
          onLoginClick={() => setLoginAberto(true)}
          onSair={() => { setUtilizador(""); setPagina("dashboard"); }}
        />
        {pagina === "admin-usuarios"
          ? <AdminUtilizadores apiUrl={apiUrl} />
          : <AdminLogs apiUrl={apiUrl} />
        }
      </div>
    );
  }

  // ── Dashboard ────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col overflow-hidden font-sans" style={{ background: "#212E3E" }}>

      <Header
        utilizador={utilizador}
        ehAdmin={ehAdmin}
        agora={agora}
        apiOk={apiOk}
        pagina={pagina}
        onPagina={setPagina}
        onLoginClick={() => setLoginAberto(true)}
        onSair={() => { setUtilizador(""); setPagina("dashboard"); }}
      />

      <main className="flex-1 flex flex-col gap-3 px-6 py-4 min-h-0 overflow-hidden">

        {/* ── Linha 1: Acesso via RDP ──────────────────────────────── */}
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
                <EclusaAcessoCard
                  key={key}
                  nomeEclusa={key}
                  nomeCliente={cliente ? CLIENTES[cliente].nome : "Posto Indisponível"}
                  sessao={cliente ? sessao(cliente) : { operador: "", timestamp_inicio: "", conectado: false }}
                  rdp={cliente ? rdpInfo(cliente) : { ocupado: false, utilizador: "", verificado: false, timestamp: "", nao_autorizado: false }}
                  agora={agora}
                  conectando={cliente ? conectando === cliente : false}
                  ehAdmin={ehAdmin}
                  onConectar={() => cliente && handleConectar(cliente)}
                  onEncerrar={() => cliente && handleEncerrar(cliente)}
                  utilizadorAtual={utilizador}
                />
              );
            })}
          </div>
        </div>

        {/* ── Linha 2: Monitoramento WinCC ─────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-4 rounded-full" style={{ background: "#00A651" }} />
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
                <EclusaMonitorCard
                  key={key}
                  nome={key}
                  eclusa={eclusa(key)}
                  ehAdmin={ehAdmin}
                  sessaoAtiva={cliente ? (sessao(cliente).conectado || rdpInfo(cliente).ocupado) : false}
                  emSupervisao={cliente ? emSupervisao === cliente : false}
                  supervisoesAtivas={cliente ? supervisoes(cliente) : []}
                  utilizadorAtual={utilizador}
                  onSupervisao={() => cliente && handleSupervisao(cliente)}
                  onSairSupervisao={handleSairSupervisao}
                />
              );
            })}
          </div>
        </div>

        {/* Loading state */}
        {!estado && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <div className="w-8 h-8 border-2 border-edp-blue border-t-transparent rounded-full animate-spin" />
            <p className="text-white/40 text-sm font-semibold">A ligar ao servidor...</p>
          </div>
        )}
      </main>

      <StatusBar apiUrl={apiUrl} apiOk={apiOk} />

      {/* Login dialog */}
      <LoginDialog
        isOpen={loginAberto}
        canClose={true}
        apiUrl={apiUrl}
        semUsers={semUsers}
        onLogin={nome => { setUtilizador(nome); setLoginAberto(false); }}
        onClose={() => setLoginAberto(false)}
        onIrAdmin={() => { setPagina("admin-usuarios"); setLoginAberto(false); }}
      />

      {/* Toast de erro */}
      {erro && (
        <div
          className="fixed bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white border border-edp-red/30 shadow-2xl text-edp-red px-5 py-3 rounded-2xl text-sm font-bold cursor-pointer z-50"
          onClick={() => setErro("")}
        >
          <span className="text-base">⚠</span>
          {erro}
          <span className="ml-2 text-edp-red/50 font-mono text-xs">✕</span>
        </div>
      )}
    </div>
  );
}
