import { useState, useEffect, useCallback } from "react";

interface LogEntry {
  id:        number;
  tipo:      string;
  mensagem:  string;
  timestamp: string;
}

const TIPO_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  login:      { label: "Login",      bg: "rgba(59,130,246,0.1)",  color: "#3b82f6" },
  logout:     { label: "Logout",     bg: "rgba(100,116,139,0.1)", color: "#64748B" },
  acesso:     { label: "Acesso",     bg: "rgba(0,166,81,0.1)",    color: "#00A651" },
  encerrar:   { label: "Encerrar",   bg: "rgba(251,146,60,0.1)",  color: "#f97316" },
  bloqueio:   { label: "Bloqueio",   bg: "rgba(227,6,19,0.1)",    color: "#E30613" },
  desconexao: { label: "Desconexao", bg: "rgba(234,179,8,0.1)",   color: "#ca8a04" },
};

interface Props {
  apiUrl: string;
}

export default function AdminLogs({ apiUrl }: Props) {
  const [logs,    setLogs]    = useState<LogEntry[]>([]);
  const [filtro,  setFiltro]  = useState<string>("todos");
  const [loading, setLoading] = useState(true);
  const [erro,    setErro]    = useState("");

  const carregar = useCallback(async () => {
    try {
      const r    = await fetch(`${apiUrl}/logs`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setLogs(await r.json() as LogEntry[]);
      setErro("");
    } catch (e) {
      setErro(`Erro ao carregar logs: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 10000);
    return () => clearInterval(t);
  }, [carregar]);

  const tipos     = ["todos", ...Array.from(new Set(logs.map(l => l.tipo))).sort()];
  const filtrados = filtro === "todos" ? logs : logs.filter(l => l.tipo === filtro);
  const cfg       = (tipo: string) => TIPO_CONFIG[tipo] ?? { label: tipo, bg: "rgba(100,116,139,0.1)", color: "#64748B" };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-6 py-5">
      <div className="flex-1 flex gap-5 min-h-0 overflow-hidden">

        {/* Sidebar: filtros + resumo */}
        <div className="w-52 shrink-0 flex flex-col gap-4">

          {/* Filtros */}
          <div
            className="rounded-2xl overflow-hidden flex flex-col"
            style={{ background: "#FFFFFF", border: "1px solid #C8D8EE", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}
          >
            <div className="px-4 py-4" style={{ background: "#F8FAFD", borderBottom: "2px solid #C8D8EE" }}>
              <p className="text-[9px] font-extrabold uppercase tracking-[0.2em]" style={{ color: "#1B2F48" }}>Filtrar por Tipo</p>
            </div>
            <div className="p-2">
              {tipos.map(t => {
                const ativo = filtro === t;
                return (
                  <button
                    key={t}
                    onClick={() => setFiltro(t)}
                    className="w-full text-left px-3 py-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer mb-0.5 capitalize"
                    style={{
                      background: ativo ? "#E30613" : "transparent",
                      color:      ativo ? "#FFFFFF" : "#64748B",
                    }}
                    onMouseEnter={e => { if (!ativo) (e.currentTarget as HTMLButtonElement).style.background = "#EEF3FB"; }}
                    onMouseLeave={e => { if (!ativo) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                  >
                    {t}
                    {t !== "todos" && (
                      <span className="ml-1.5 text-[9px] font-mono opacity-50">({logs.filter(l => l.tipo === t).length})</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Resumo */}
          <div
            className="rounded-2xl p-4"
            style={{ background: "#FFFFFF", border: "1px solid #C8D8EE", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}
          >
            <div className="px-0 pb-3 mb-3" style={{ borderBottom: "1px solid #EEF3FB" }}>
              <p className="text-[9px] font-extrabold uppercase tracking-[0.2em]" style={{ color: "#1B2F48" }}>Resumo</p>
            </div>
            <div className="flex flex-col gap-3">
              {[
                { label: "Total",     valor: logs.length,                                    cor: "#1B2F48" },
                { label: "Bloqueios", valor: logs.filter(l => l.tipo === "bloqueio").length, cor: "#E30613" },
                { label: "Acessos",   valor: logs.filter(l => l.tipo === "acesso").length,   cor: "#00A651" },
                { label: "Logins",    valor: logs.filter(l => l.tipo === "login").length,    cor: "#3b82f6" },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold" style={{ color: "#7A94C1" }}>{s.label}</span>
                  <span className="text-[14px] font-extrabold" style={{ color: s.cor }}>{s.valor}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card principal */}
        <div
          className="flex-1 rounded-2xl overflow-hidden flex flex-col"
          style={{ background: "#FFFFFF", border: "1px solid #C8D8EE", boxShadow: "0 2px 16px rgba(0,0,0,0.08)" }}
        >
          {/* Cabecalho */}
          <div
            className="shrink-0 px-8 py-5 flex items-center justify-between"
            style={{ background: "#F8FAFD", borderBottom: "2px solid #C8D8EE" }}
          >
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.22em]" style={{ color: "#1B2F48" }}>
                Administracao do Sistema
              </p>
              <p className="text-[22px] font-black leading-tight mt-0.5" style={{ color: "#1B2F48" }}>
                Registos de Eventos
              </p>
            </div>
            <div className="flex items-center gap-4">
              {!loading && erro && (
                <span className="text-[11px] font-semibold" style={{ color: "#E30613" }}>{erro}</span>
              )}
              <div
                className="flex items-center gap-2 px-4 py-2 rounded-full"
                style={{ background: "#EEF3FB", border: "1px solid #C8D8EE" }}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: "#00A651" }} />
                <span className="font-extrabold text-[14px]" style={{ color: "#1B2F48" }}>{filtrados.length}</span>
                <span className="text-[11px] font-semibold" style={{ color: "#7A94C1" }}>
                  {filtro === "todos" ? "eventos" : filtro}
                </span>
              </div>
              <button
                onClick={carregar}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-extrabold text-[13px] transition-all cursor-pointer"
                style={{ background: "#EEF3FB", border: "1px solid #C8D8EE", color: "#1B2F48" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#C8D8EE"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#EEF3FB"; }}
              >
                Atualizar
              </button>
            </div>
          </div>

          {/* Tabela */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "#C8D8EE", borderTopColor: "#1B2F48" }} />
              </div>
            ) : filtrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "#EEF3FB" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7A94C1" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <p className="text-[14px] font-bold" style={{ color: "#7A94C1" }}>Sem registos</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="sticky top-0" style={{ background: "#1B2F48" }}>
                  <tr>
                    <th className="text-left px-8 py-3.5 text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: "#FFFFFF" }}>Tipo</th>
                    <th className="text-left px-8 py-3.5 text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: "#FFFFFF" }}>Mensagem</th>
                    <th className="text-right px-8 py-3.5 text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: "#FFFFFF" }}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((log, i) => {
                    const c = cfg(log.tipo);
                    return (
                      <tr
                        key={log.id}
                        style={{ borderBottom: "1px solid #EEF3FB", background: i % 2 === 1 ? "#F8FAFD" : "#FFFFFF" }}
                      >
                        <td className="px-8 py-3.5">
                          <span
                            className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-extrabold capitalize"
                            style={{ background: c.bg, color: c.color }}
                          >
                            {c.label}
                          </span>
                        </td>
                        <td className="px-8 py-3.5 text-[13px] font-medium" style={{ color: "#1B2F48" }}>{log.mensagem}</td>
                        <td className="px-8 py-3.5 text-right">
                          <span className="text-[12px] font-mono" style={{ color: "#64748B" }}>{log.timestamp}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}