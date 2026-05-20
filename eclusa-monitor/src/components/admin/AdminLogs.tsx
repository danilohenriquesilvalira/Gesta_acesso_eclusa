import { useState, useEffect, useCallback, useRef } from "react";
import TabelaAdmin, { type ColunaConfig } from "./TabelaAdmin";

interface LogEntry {
  id:        number;
  tipo:      string;
  mensagem:  string;
  ip:        string | null;
  timestamp: string;
}

const fmtIp = (ip: string | null) => ip ? ip.replace(/\/\d+$/, "") : null;

const TIPO_META: Record<string, { label: string; cor: string; bg: string }> = {
  login_ok:         { label: "Login OK",      cor: "#225E66", bg: "rgba(34,94,102,0.1)" },
  login_falhou:     { label: "Login Falhado", cor: "#E32C2C", bg: "rgba(227,44,44,0.07)" },
  logout:           { label: "Logout",        cor: "#455558", bg: "#F1F4F4" },
  sessao_iniciada:  { label: "Sessão",        cor: "#263CC8", bg: "rgba(38,60,200,0.08)" },
  sessao_encerrada: { label: "Encerrada",     cor: "#7C9599", bg: "#F1F4F4" },
  user_criado:      { label: "Novo User",     cor: "#225E66", bg: "rgba(34,94,102,0.1)" },
  user_actualizado: { label: "User Editado",  cor: "#7C9599", bg: "#F1F4F4" },
  user_eliminado:   { label: "User Removido", cor: "#E32C2C", bg: "rgba(227,44,44,0.07)" },
  bloqueio:         { label: "IP Bloqueado",  cor: "#E32C2C", bg: "rgba(227,44,44,0.07)" },
};
const DEFAULT_TIPO = { label: "Evento", cor: "#7C9599", bg: "#F1F4F4" };

const FILTROS = [
  { id: "todos",  label: "Todos" },
  { id: "acesso", label: "Acessos",  tipos: ["login_ok", "logout", "sessao_iniciada", "sessao_encerrada"] },
  { id: "falhas", label: "Falhas",   tipos: ["login_falhou", "bloqueio"] },
  { id: "admin",  label: "Admin",    tipos: ["user_criado", "user_actualizado", "user_eliminado"] },
];

// Cache module-level — sobrevive a navegação entre páginas
let _cachedLogs: LogEntry[] = [];

const MES_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const PER_PAGE = 12;

interface Props { apiUrl: string; token: string; }

const IcoDoc = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);
const IcoCheck = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);
const IcoXCircle = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
  </svg>
);
const IcoMonitor = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
  </svg>
);
const IcoLock = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

export default function AdminLogs({ apiUrl, token }: Props) {
  const [logs,     setLogs]     = useState<LogEntry[]>(_cachedLogs);
  const [filtro,   setFiltro]   = useState("todos");
  const [pesquisa, setPesquisa] = useState("");
  const [loading,  setLoading]  = useState(_cachedLogs.length === 0);
  const [mes,      setMes]      = useState(() => new Date());
  const [page,     setPage]     = useState(1);
  const [vivo,     setVivo]     = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const agora = new Date();

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`${apiUrl}/logs`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error();
      _cachedLogs = await r.json() as LogEntry[];
      setLogs(_cachedLogs);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [apiUrl, token]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (vivo) timerRef.current = setInterval(carregar, 10_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [vivo, carregar]);
  useEffect(() => { setPage(1); }, [filtro, mes, pesquisa]);

  const isMesAtual = mes.getMonth() === agora.getMonth() && mes.getFullYear() === agora.getFullYear();
  const navMes = (d: number) => setMes(m => new Date(m.getFullYear(), m.getMonth() + d, 1));

  const doMes = logs.filter(l => {
    try {
      const d = new Date(l.timestamp);
      return d.getMonth() === mes.getMonth() && d.getFullYear() === mes.getFullYear();
    } catch { return false; }
  });

  const filtrado = (() => {
    const f = FILTROS.find(f => f.id === filtro);
    let base = !f || !("tipos" in f) || !f.tipos
      ? doMes
      : doMes.filter(l => (f.tipos as string[]).includes(l.tipo));
    const q = pesquisa.trim().toLowerCase();
    if (q) base = base.filter(l =>
      l.mensagem.toLowerCase().includes(q) || (l.ip ?? "").replace(/\/\d+$/, "").toLowerCase().includes(q),
    );
    return base;
  })();

  const paginados = filtrado.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const fmtData = (iso: string) => {
    try {
      const d = new Date(iso);
      return {
        data: d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "2-digit" }),
        hora: d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      };
    } catch { return { data: "—", hora: "—" }; }
  };

  const stats = [
    { label: "Total",     v: doMes.length,                                           cor: "#212E3E", Icon: IcoDoc     },
    { label: "Logins OK", v: doMes.filter(l => l.tipo === "login_ok").length,        cor: "#225E66", Icon: IcoCheck   },
    { label: "Falhas",    v: doMes.filter(l => l.tipo === "login_falhou").length,    cor: "#E32C2C", Icon: IcoXCircle },
    { label: "Sessões",   v: doMes.filter(l => l.tipo === "sessao_iniciada").length, cor: "#263CC8", Icon: IcoMonitor },
    { label: "Bloqueios", v: doMes.filter(l => l.tipo === "bloqueio").length,        cor: "#E32C2C", Icon: IcoLock    },
  ];

  // ── Definição de colunas ────────────────────────────────────────────────────

  const colunas: ColunaConfig<LogEntry>[] = [
    {
      header: "Tipo",
      width:  "minmax(0,1.5fr)",
      render: l => {
        const m = TIPO_META[l.tipo] ?? DEFAULT_TIPO;
        return (
          <span className="px-3 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wide"
            style={{ background: m.bg, color: m.cor }}>
            {m.label}
          </span>
        );
      },
    },
    {
      header: "Mensagem",
      width:  "minmax(0,3.5fr)",
      render: l => (
        <p className="text-[12px] font-semibold truncate pr-3" style={{ color: "#212E3E" }} title={l.mensagem}>
          {l.mensagem}
        </p>
      ),
    },
    {
      header: "Endereço IP",
      width:  "minmax(0,1.5fr)",
      center: true,
      render: l => {
        const ip = fmtIp(l.ip);
        return ip
          ? <span className="font-mono text-[12px] px-2.5 py-1 rounded-lg"
              style={{ background: "#EFF7F7", color: "#212E3E" }}>{ip}</span>
          : <span style={{ color: "#C8D4D5" }}>—</span>;
      },
    },
    {
      header: "Data / Hora",
      width:  "minmax(0,1.4fr)",
      center: true,
      render: l => {
        const { data, hora } = fmtData(l.timestamp);
        return (
          <div>
            <p className="text-[12px] font-bold" style={{ color: "#212E3E" }}>{hora}</p>
            <p className="text-[11px] font-mono mt-0.5" style={{ color: "#455558" }}>{data}</p>
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-8 pt-6 pb-5 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.25em]"
            style={{ color: "rgba(255,255,255,0.3)" }}>Auditoria do Sistema</p>
          <h1 className="text-[26px] font-black text-white mt-0.5 leading-tight">Registos de Eventos</h1>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <button onClick={() => setVivo(v => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer"
            style={{ background: vivo ? "rgba(40,255,82,0.12)" : "rgba(255,255,255,0.08)", border: `1px solid ${vivo ? "rgba(40,255,82,0.35)" : "rgba(255,255,255,0.12)"}` }}>
            <span className="w-2 h-2 rounded-full" style={{ background: vivo ? "#28FF52" : "#7C9599", animation: vivo ? "pulse 1.5s infinite" : "none" }} />
            <span className="text-[12px] font-bold" style={{ color: vivo ? "#28FF52" : "#7C9599" }}>
              {vivo ? "Ao vivo" : "Pausado"}
            </span>
          </button>
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
      </div>

      {/* ── Estatísticas ──────────────────────────────────────────────────── */}
      <div className="shrink-0 px-8 pb-5 grid grid-cols-5 gap-3">
        {stats.map(({ label, v, cor, Icon }) => (
          <div key={label} className="rounded-2xl px-5 py-4 flex items-center gap-4"
            style={{ background: "#FFFFFF", boxShadow: "0 1px 4px rgba(0,0,0,0.12)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: v > 0 ? `${cor}18` : "#F1F4F4", color: v > 0 ? cor : "#BECACC" }}>
              <Icon />
            </div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "#7C9599" }}>{label}</p>
              <p className="text-[26px] font-black leading-none tabular-nums" style={{ color: v > 0 ? cor : "#BECACC" }}>{v}</p>
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
        rowLeftBorder={l =>
          l.tipo.includes("falh") || l.tipo === "bloqueio" || l.tipo.includes("eliminad")
            ? "#E32C2C"
            : "transparent"
        }
        total={filtrado.length}
        page={page}
        perPage={PER_PAGE}
        onPageChange={setPage}
        emptyTitle={pesquisa ? `Sem resultados para "${pesquisa}"` : `Sem eventos em ${MES_PT[mes.getMonth()]} ${mes.getFullYear()}`}
        emptySubtitle={pesquisa ? "Tenta outro termo de pesquisa" : "Usa as setas para navegar entre meses"}
        toolbar={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              {/* Filtros segmented */}
              <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "#F1F4F4" }}>
                {FILTROS.map(f => {
                  const count = !("tipos" in f) || !f.tipos
                    ? doMes.length
                    : doMes.filter(l => (f.tipos as string[]).includes(l.tipo)).length;
                  const ativo = filtro === f.id;
                  return (
                    <button key={f.id} onClick={() => setFiltro(f.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer transition-all"
                      style={{
                        background: ativo ? "#FFFFFF" : "transparent",
                        color:      ativo ? "#212E3E" : "#7C9599",
                        boxShadow:  ativo ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                      }}>
                      {f.label}
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold tabular-nums"
                        style={{ background: ativo ? "#F1F4F4" : "transparent", color: ativo ? "#455558" : "#BECACC" }}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
              {/* Pesquisa */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: "#F1F4F4", border: "1px solid #E6EBEC" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7C9599" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input value={pesquisa} onChange={e => setPesquisa(e.target.value)}
                  placeholder="Pesquisar mensagem ou IP..."
                  className="bg-transparent text-[12px] font-semibold focus:outline-none w-52"
                  style={{ color: "#212E3E" }}
                />
                {pesquisa && (
                  <button onClick={() => setPesquisa("")}
                    className="flex items-center justify-center cursor-pointer" style={{ color: "#7C9599" }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold" style={{ color: "#7C9599" }}>
                {filtrado.length} {filtrado.length === 1 ? "evento" : "eventos"}
              </span>
              <button onClick={carregar}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold cursor-pointer"
                style={{ background: "#EFF7F7", color: "#225E66", border: "1px solid rgba(34,94,102,0.2)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#D8EFEE"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#EFF7F7"; }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                Actualizar
              </button>
            </div>
          </div>
        }
      />
    </div>
  );
}
