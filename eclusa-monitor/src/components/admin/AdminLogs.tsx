import { useState, useEffect, useMemo } from "react";
import TabelaAdmin, { type ColunaConfig } from "./TabelaAdmin";

interface LogEntry {
  id:        number;
  tipo:      string;
  mensagem:  string;
  ip:        string | null;
  timestamp: string;
}

const fmtIp = (ip: string | null) => ip ? ip.replace(/\/\d+$/, "") : null;

// ── Metadados por tipo de evento (namespaced) ────────────────────────────────
const TIPO_META: Record<string, { label: string; cor: string; bg: string }> = {
  // auth.*
  "auth.login_ok":         { label: "Login OK",            cor: "#28FF52",                bg: "rgba(40,255,82,0.12)"   },
  "auth.login_falhou":     { label: "Login Falhado",       cor: "#E32C2C",                bg: "rgba(227,44,44,0.15)"   },
  "auth.logout":           { label: "Logout",              cor: "rgba(255,255,255,0.45)", bg: "rgba(255,255,255,0.07)" },
  "auth.force_logout":     { label: "Logout Forçado",      cor: "#E32C2C",                bg: "rgba(227,44,44,0.15)"   },
  "auth.senha_alterada":   { label: "Senha Alterada",      cor: "#64E4EE",                bg: "rgba(34,94,102,0.2)"    },
  // sessao.*
  "sessao.iniciada":            { label: "Sessão Iniciada",    cor: "#7D8ADE",                bg: "rgba(38,60,200,0.18)"   },
  "sessao.encerrada":           { label: "Sessão Encerrada",   cor: "rgba(255,255,255,0.45)", bg: "rgba(255,255,255,0.07)" },
  "sessao.encerrada_wincc":     { label: "Encerrada WinCC",    cor: "#F7D200",                bg: "rgba(247,210,0,0.12)"   },
  "sessao.auto_encerrada":      { label: "Auto-Encerrada",     cor: "rgba(255,165,0,0.9)",    bg: "rgba(255,165,0,0.10)"   },
  "sessao.retorno_original":    { label: "Retorno Original",   cor: "#0CD3F8",                bg: "rgba(12,211,248,0.10)"  },
  "sessao.force_encerrada":     { label: "Saída Forçada",      cor: "#E32C2C",                bg: "rgba(227,44,44,0.15)"   },
  // supervisao.*
  "supervisao.iniciada":        { label: "Supervisão Iniciada",  cor: "#B78BFF",              bg: "rgba(103,58,183,0.18)"  },
  "supervisao.encerrada":       { label: "Supervisão Encerrada", cor: "rgba(255,255,255,0.45)", bg: "rgba(255,255,255,0.07)"},
  // failover.*
  "failover.iniciado":          { label: "Failover Iniciado",   cor: "#FF6B2B",                bg: "rgba(255,107,43,0.18)"  },
  "failover.resolvido":         { label: "Failover Resolvido",  cor: "#28FF52",                bg: "rgba(40,255,82,0.12)"   },
  "failover.windows_caiu":      { label: "Windows Offline",     cor: "#FF6B2B",                bg: "rgba(255,107,43,0.15)"  },
  "failover.wincc_caiu":        { label: "WinCC Offline",       cor: "#F7D200",                bg: "rgba(247,210,0,0.12)"   },
  // sistema.*
  "sistema.ip_bloqueado":       { label: "IP Bloqueado",        cor: "#F7D200",                bg: "rgba(247,210,0,0.12)"   },
  "sistema.ip_desbloqueado":    { label: "IP Desbloqueado",     cor: "#28FF52",                bg: "rgba(40,255,82,0.10)"   },
  "sistema.blacklist_add":      { label: "Blacklist Add",        cor: "#F7D200",                bg: "rgba(247,210,0,0.12)"   },
  "sistema.blacklist_removido": { label: "Blacklist Removido",   cor: "#0CD3F8",                bg: "rgba(12,211,248,0.10)"  },
  // utilizador.*
  "utilizador.criado":          { label: "Utilizador Criado",   cor: "#64E4EE",                bg: "rgba(34,94,102,0.2)"    },
  "utilizador.editado":         { label: "Utilizador Editado",  cor: "rgba(255,255,255,0.45)", bg: "rgba(255,255,255,0.07)" },
  "utilizador.eliminado":       { label: "Utilizador Removido", cor: "#E32C2C",                bg: "rgba(227,44,44,0.15)"   },
};
const DEFAULT_TIPO = { label: "Evento", cor: "rgba(255,255,255,0.35)", bg: "rgba(255,255,255,0.07)" };

// ── Categorias (namespace prefix) ────────────────────────────────────────────
const CATEGORIAS = [
  { id: "todos",      label: "Todos",       prefix: null  as string | null },
  { id: "auth",       label: "Acessos",     prefix: "auth"       },
  { id: "sessao",     label: "Sessões",     prefix: "sessao"     },
  { id: "supervisao", label: "Supervisão",  prefix: "supervisao" },
  { id: "failover",   label: "Failover",    prefix: "failover"   },
  { id: "sistema",    label: "Sistema/IP",  prefix: "sistema"    },
  { id: "utilizador", label: "Utilizadores",prefix: "utilizador" },
];

// ── Filtro de eclusa (lê a descrição) ────────────────────────────────────────
const ECLUSAS = [
  { id: "ambas", label: "Todas Eclusas" },
  { id: "RG",    label: "Eclusa RG"     },
  { id: "PN",    label: "Eclusa PN"     },
];

function matchEclusa(mensagem: string, eclusaId: string): boolean {
  if (eclusaId === "ambas") return true;
  const lower = mensagem.toLowerCase();
  if (eclusaId === "RG") return lower.includes("eclusa rg");
  if (eclusaId === "PN") return lower.includes("eclusa pn");
  return true;
}

function borderColor(tipo: string): string {
  if (tipo.startsWith("failover."))                return "#FF6B2B";
  if (tipo === "auth.login_falhou")                return "#E32C2C";
  if (tipo === "sistema.ip_bloqueado" || tipo === "sistema.blacklist_add") return "#F7D200";
  if (tipo === "sessao.auto_encerrada" || tipo === "sessao.encerrada_wincc") return "#F7D200";
  if (tipo === "sessao.force_encerrada" || tipo === "utilizador.eliminado") return "#E32C2C";
  return "transparent";
}

const MES_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const PER_PAGE = 15;

let _cachedLogs: LogEntry[] = [];

interface Props { apiUrl: string; token: string; }

const IcoDoc      = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
const IcoCheck    = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
const IcoXCircle  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>;
const IcoMonitor  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>;
const IcoLock     = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
const IcoAlert    = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="10.29 3.86 1.82 18 22.18 18 13.71 3.86 10.29 3.86"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
const IcoServer   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>;

export default function AdminLogs({ apiUrl, token }: Props) {
  const agora = new Date();

  const [todos,     setTodos]     = useState<LogEntry[]>(_cachedLogs);
  const [loading,   setLoading]   = useState(_cachedLogs.length === 0);
  const [categoria, setCategoria] = useState("todos");
  const [eclusa,    setEclusa]    = useState("ambas");
  const [operador,  setOperador]  = useState("");
  const [pesquisa,  setPesquisa]  = useState("");
  const [mes,       setMes]       = useState(() => new Date());
  const [page,      setPage]      = useState(1);

  async function carregar() {
    setLoading(true);
    try {
      const r = await fetch(`${apiUrl}/logs?por_pagina=500`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return;
      const raw = await r.json();
      const arr: LogEntry[] = Array.isArray(raw) ? raw : (Array.isArray(raw.logs) ? raw.logs : []);
      _cachedLogs = arr;
      setTodos(arr);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []); // eslint-disable-line

  useEffect(() => { setPage(1); }, [categoria, eclusa, operador, pesquisa, mes]);

  const isMesAtual = mes.getMonth() === agora.getMonth() && mes.getFullYear() === agora.getFullYear();
  const navMes = (d: number) => setMes(m => new Date(m.getFullYear(), m.getMonth() + d, 1));

  // Filtro por mês
  const doMes = useMemo(() => todos.filter(l => {
    try {
      const d = new Date(l.timestamp);
      return d.getMonth() === mes.getMonth() && d.getFullYear() === mes.getFullYear();
    } catch { return false; }
  }), [todos, mes]);

  // Filtro completo: categoria + eclusa + operador + pesquisa livre
  const filtrado = useMemo(() => {
    const cat = CATEGORIAS.find(c => c.id === categoria);
    let base = cat?.prefix
      ? doMes.filter(l => l.tipo.startsWith(cat.prefix + "."))
      : doMes;

    if (eclusa !== "ambas")
      base = base.filter(l => matchEclusa(l.mensagem, eclusa));

    const op = operador.trim().toLowerCase();
    if (op)
      base = base.filter(l => l.mensagem.toLowerCase().includes(op));

    const q = pesquisa.trim().toLowerCase();
    if (q)
      base = base.filter(l =>
        l.mensagem.toLowerCase().includes(q) || (fmtIp(l.ip) ?? "").includes(q)
      );

    return base;
  }, [doMes, categoria, eclusa, operador, pesquisa]);

  const paginados = useMemo(
    () => filtrado.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    [filtrado, page]
  );

  const fmtData = (iso: string) => {
    try {
      const d = new Date(iso);
      return {
        data: d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "2-digit" }),
        hora: d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      };
    } catch { return { data: "—", hora: "—" }; }
  };

  const stats = useMemo(() => [
    { label: "Total Mês",    v: doMes.length,                                                                      cor: "rgba(255,255,255,0.8)", Icon: IcoDoc     },
    { label: "Logins OK",    v: doMes.filter(l => l.tipo === "auth.login_ok").length,                              cor: "#28FF52",               Icon: IcoCheck   },
    { label: "Falhas Login", v: doMes.filter(l => l.tipo === "auth.login_falhou").length,                          cor: "#E32C2C",               Icon: IcoXCircle },
    { label: "Sessões RG",   v: doMes.filter(l => l.tipo === "sessao.iniciada" && matchEclusa(l.mensagem,"RG")).length, cor: "#7D8ADE",          Icon: IcoMonitor },
    { label: "Sessões PN",   v: doMes.filter(l => l.tipo === "sessao.iniciada" && matchEclusa(l.mensagem,"PN")).length, cor: "#B78BFF",          Icon: IcoServer  },
    { label: "Failovers",    v: doMes.filter(l => l.tipo === "failover.iniciado").length,                          cor: "#FF6B2B",               Icon: IcoAlert   },
    { label: "Bloqueios IP", v: doMes.filter(l => l.tipo === "sistema.ip_bloqueado" || l.tipo === "sistema.blacklist_add").length, cor: "#F7D200", Icon: IcoLock },
  ], [doMes]);

  const colunas: ColunaConfig<LogEntry>[] = useMemo(() => [
    {
      header: "Tipo",
      width:  "minmax(0,1.8fr)",
      render: l => {
        const m = TIPO_META[l.tipo] ?? DEFAULT_TIPO;
        return (
          <span className="px-3 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wide whitespace-nowrap"
            style={{ background: m.bg, color: m.cor }}>
            {m.label}
          </span>
        );
      },
    },
    {
      header: "Mensagem",
      width:  "minmax(0,3.8fr)",
      render: l => (
        <p className="text-[12px] font-semibold pr-3"
          style={{ color: "rgba(255,255,255,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          title={l.mensagem}>
          {l.mensagem}
        </p>
      ),
    },
    {
      header: "Endereço IP",
      width:  "minmax(0,1.3fr)",
      center: true,
      render: l => {
        const ip = fmtIp(l.ip);
        return ip
          ? <span className="font-mono text-[12px] px-2.5 py-1 rounded-lg"
              style={{ background: "rgba(34,94,102,0.2)", color: "#A8FFBA" }}>{ip}</span>
          : <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>;
      },
    },
    {
      header: "Data / Hora",
      width:  "minmax(0,1.3fr)",
      center: true,
      render: l => {
        const { data, hora } = fmtData(l.timestamp);
        return (
          <div>
            <p className="text-[12px] font-bold" style={{ color: "rgba(255,255,255,0.8)" }}>{hora}</p>
            <p className="text-[11px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{data}</p>
          </div>
        );
      },
    },
  ], []); // eslint-disable-line

  const activeFilters = (categoria !== "todos" ? 1 : 0) + (eclusa !== "ambas" ? 1 : 0) + (operador ? 1 : 0) + (pesquisa ? 1 : 0);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-8 pt-6 pb-5 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.22em]"
            style={{ color: "rgba(255,255,255,0.3)" }}>Auditoria do Sistema</p>
          <h1 className="text-[26px] font-black text-white mt-0.5 leading-tight">Registos de Eventos</h1>
        </div>
        {/* Navegação de mês */}
        <div className="flex items-center gap-1">
          <button onClick={() => navMes(-1)}
            className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer"
            style={{ background: "rgba(255,255,255,0.08)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.14)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="px-5 py-2 rounded-xl text-center" style={{ background: "rgba(255,255,255,0.08)", minWidth: 150 }}>
            <p className="text-white font-extrabold text-[15px] leading-none">{MES_PT[mes.getMonth()]}</p>
            <p className="font-semibold text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{mes.getFullYear()}</p>
          </div>
          <button onClick={() => navMes(1)} disabled={isMesAtual}
            className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed"
            style={{ background: "rgba(255,255,255,0.08)" }}
            onMouseEnter={e => { if (!isMesAtual) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.14)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>

      {/* ── Estatísticas ──────────────────────────────────────────────────── */}
      <div className="shrink-0 px-8 pb-5 grid grid-cols-7 gap-3">
        {stats.map(({ label, v, cor, Icon }) => (
          <div key={label} className="rounded-2xl px-4 py-4 flex items-center gap-3"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: v > 0 ? `${cor}22` : "rgba(255,255,255,0.04)", color: v > 0 ? cor : "rgba(255,255,255,0.2)" }}>
              <Icon />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] truncate" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</p>
              <p className="text-[26px] font-black leading-none tabular-nums mt-0.5" style={{ color: v > 0 ? cor : "rgba(255,255,255,0.2)" }}>{v}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabela ────────────────────────────────────────────────────────── */}
      <TabelaAdmin<LogEntry>
        className="flex-1 mx-8 mb-6"
        dados={paginados}
        colunas={colunas}
        keyFn={l => l.id}
        loading={loading}
        rowLeftBorder={l => borderColor(l.tipo)}
        total={filtrado.length}
        page={page}
        perPage={PER_PAGE}
        onPageChange={setPage}
        emptyTitle={
          activeFilters > 0
            ? "Sem resultados com os filtros activos"
            : `Sem eventos em ${MES_PT[mes.getMonth()]} ${mes.getFullYear()}`
        }
        emptySubtitle={
          activeFilters > 0
            ? "Ajusta os filtros ou limpa a pesquisa"
            : "Usa as setas para navegar entre meses"
        }
        toolbar={
          <div className="flex flex-col gap-3 w-full">
            {/* Linha 1: categoria + eclusa + operador */}
            <div className="flex items-center gap-3 flex-wrap">

              {/* Categoria */}
              <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.06)" }}>
                {CATEGORIAS.map(c => {
                  const count = c.prefix
                    ? doMes.filter(l => l.tipo.startsWith(c.prefix + ".")).length
                    : doMes.length;
                  const ativo = categoria === c.id;
                  return (
                    <button key={c.id} onClick={() => setCategoria(c.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer transition-all"
                      style={{
                        background: ativo ? "rgba(255,255,255,0.1)" : "transparent",
                        color: ativo ? "#FFFFFF" : "rgba(255,255,255,0.4)",
                        boxShadow: ativo ? "0 1px 4px rgba(0,0,0,0.2)" : "none",
                      }}>
                      {c.label}
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold tabular-nums"
                        style={{
                          background: ativo ? "rgba(255,255,255,0.08)" : "transparent",
                          color: ativo ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)",
                        }}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Eclusa */}
              <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.06)" }}>
                {ECLUSAS.map(e => {
                  const ativo = eclusa === e.id;
                  return (
                    <button key={e.id} onClick={() => setEclusa(e.id)}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer transition-all"
                      style={{
                        background: ativo ? "rgba(125,138,222,0.25)" : "transparent",
                        color: ativo ? "#7D8ADE" : "rgba(255,255,255,0.4)",
                      }}>
                      {e.label}
                    </button>
                  );
                })}
              </div>

              {/* Filtro por operador */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                <input value={operador} onChange={e => setOperador(e.target.value)}
                  placeholder="Operador..."
                  className="bg-transparent text-[12px] font-semibold focus:outline-none w-32 placeholder:text-white/20"
                  style={{ color: "rgba(255,255,255,0.8)" }} />
                {operador && (
                  <button onClick={() => setOperador("")} className="flex items-center justify-center cursor-pointer" style={{ color: "rgba(255,255,255,0.4)" }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}
              </div>

              {/* Pesquisa livre */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input value={pesquisa} onChange={e => setPesquisa(e.target.value)}
                  placeholder="Pesquisar mensagem ou IP..."
                  className="bg-transparent text-[12px] font-semibold focus:outline-none w-48 placeholder:text-white/20"
                  style={{ color: "rgba(255,255,255,0.8)" }} />
                {pesquisa && (
                  <button onClick={() => setPesquisa("")} className="flex items-center justify-center cursor-pointer" style={{ color: "rgba(255,255,255,0.4)" }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}
              </div>

              <div className="ml-auto flex items-center gap-2">
                {activeFilters > 0 && (
                  <button
                    onClick={() => { setCategoria("todos"); setEclusa("ambas"); setOperador(""); setPesquisa(""); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold cursor-pointer"
                    style={{ background: "rgba(227,44,44,0.12)", color: "#E32C2C", border: "1px solid rgba(227,44,44,0.2)" }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    Limpar filtros
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold"
                      style={{ background: "rgba(227,44,44,0.15)", color: "#E32C2C" }}>{activeFilters}</span>
                  </button>
                )}
                <span className="text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.3)" }}>
                  {filtrado.length} {filtrado.length === 1 ? "evento" : "eventos"}
                </span>
                <button onClick={carregar}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold cursor-pointer"
                  style={{ background: "rgba(34,94,102,0.2)", color: "#64E4EE", border: "1px solid rgba(34,94,102,0.3)" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(34,94,102,0.3)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(34,94,102,0.2)"; }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                  </svg>
                  Actualizar
                </button>
              </div>
            </div>
          </div>
        }
      />
    </div>
  );
}
