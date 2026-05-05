import { useState, useEffect, useCallback } from "react";

interface LogEntry {
  id:         number;
  tipo:       string;
  mensagem:   string;
  timestamp:  string;
}

const TIPO_CONFIG: Record<string, { cor: string; icon: string }> = {
  login:       { cor: "text-edp-blue bg-blue-50 border-blue-200",    icon: "→" },
  logout:      { cor: "text-edp-sub bg-edp-surface border-edp-border", icon: "←" },
  acesso:      { cor: "text-edp-green bg-green-50 border-green-200",  icon: "▶" },
  encerrar:    { cor: "text-orange-600 bg-orange-50 border-orange-200", icon: "■" },
  bloqueio:    { cor: "text-edp-red bg-red-50 border-red-200",        icon: "⊘" },
  desconexao:  { cor: "text-yellow-700 bg-yellow-50 border-yellow-200", icon: "✕" },
};

interface Props {
  apiUrl:   string;
  onVoltar: () => void;
}

export default function AdminLogs({ apiUrl, onVoltar }: Props) {
  const [logs,     setLogs]     = useState<LogEntry[]>([]);
  const [filtro,   setFiltro]   = useState<string>("todos");
  const [loading,  setLoading]  = useState(true);
  const [erro,     setErro]     = useState("");

  const carregar = useCallback(async () => {
    try {
      const r    = await fetch(`${apiUrl}/logs`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json() as LogEntry[];
      setLogs(data);
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

  const tipos = ["todos", ...Array.from(new Set(logs.map(l => l.tipo))).sort()];
  const filtrados = filtro === "todos" ? logs : logs.filter(l => l.tipo === filtro);

  const cfg = (tipo: string) => TIPO_CONFIG[tipo] ?? { cor: "text-edp-sub bg-edp-surface border-edp-border", icon: "•" };

  return (
    <div className="h-screen flex flex-col font-sans overflow-hidden" style={{ background: "#212E3E" }}>

      {/* Faixa topo */}
      <div className="shrink-0 border-b border-white/10 px-6 py-3 flex items-center justify-between" style={{ background: "#212E3E" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-edp-red rounded-lg flex items-center justify-center">
            <span className="text-white font-black text-xs">EDP</span>
          </div>
          <div>
            <p className="text-xs font-extrabold text-white leading-none">Logs do Sistema</p>
            <p className="text-[9px] text-white/35 mt-0.5">Histórico de Acessos e Eventos</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={carregar}
            className="px-3 py-1.5 rounded-lg border border-white/15 text-white/60 hover:text-white hover:border-white/40 text-xs font-bold transition-all cursor-pointer"
          >
            ↻ Atualizar
          </button>
          <button
            onClick={onVoltar}
            className="px-4 py-1.5 rounded-lg border border-white/15 text-white/60 hover:text-white hover:border-white/40 text-xs font-bold transition-all cursor-pointer"
          >
            ← Voltar
          </button>
        </div>
      </div>

      <main className="flex-1 flex gap-5 p-6 min-h-0 overflow-hidden">

        {/* Sidebar filtros + stats */}
        <div className="w-52 shrink-0 flex flex-col gap-4">
          {/* Filtro por tipo */}
          <div className="bg-edp-card rounded-2xl border border-edp-border shadow-md overflow-hidden">
            <div className="bg-edp-surface border-b border-edp-border px-4 py-3">
              <p className="text-[9px] font-extrabold text-edp-sub uppercase tracking-widest">Filtrar por Tipo</p>
            </div>
            <div className="p-2">
              {tipos.map(t => (
                <button
                  key={t}
                  onClick={() => setFiltro(t)}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer mb-0.5 ${
                    filtro === t
                      ? "bg-edp-blue text-white"
                      : "text-edp-sub hover:bg-edp-surface hover:text-edp-text"
                  }`}
                >
                  <span className="capitalize">{t}</span>
                  {t !== "todos" && (
                    <span className={`ml-1.5 text-[9px] font-mono ${filtro === t ? "text-white/60" : "text-edp-sub/60"}`}>
                      ({logs.filter(l => l.tipo === t).length})
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Estatísticas */}
          <div className="bg-edp-card rounded-2xl border border-edp-border shadow-md p-4">
            <p className="text-[9px] font-extrabold text-edp-sub uppercase tracking-widest mb-3">Resumo</p>
            <div className="space-y-2">
              {[
                { label: "Total de eventos", valor: logs.length, cor: "text-edp-blue" },
                { label: "Bloqueios",        valor: logs.filter(l => l.tipo === "bloqueio").length, cor: "text-edp-red" },
                { label: "Acessos",          valor: logs.filter(l => l.tipo === "acesso").length, cor: "text-edp-green" },
                { label: "Logins",           valor: logs.filter(l => l.tipo === "login").length, cor: "text-edp-blue" },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between">
                  <span className="text-[9px] text-edp-sub font-semibold">{s.label}</span>
                  <span className={`text-xs font-extrabold ${s.cor}`}>{s.valor}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabela de logs */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="bg-edp-card rounded-2xl border border-edp-border shadow-md overflow-hidden flex flex-col flex-1">
            <div className="bg-edp-surface border-b border-edp-border px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-extrabold text-edp-text">Registos de Eventos</h2>
                <p className="text-[10px] text-edp-sub mt-0.5">
                  {filtro === "todos" ? `${logs.length} eventos` : `${filtrados.length} eventos · ${filtro}`}
                </p>
              </div>
              {!loading && erro && (
                <span className="text-xs text-edp-red font-semibold">{erro}</span>
              )}
            </div>

            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-6 h-6 border-2 border-edp-blue border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filtrados.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <p className="text-edp-sub text-sm font-semibold">Sem registos</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-edp-surface border-b border-edp-border">
                    <tr>
                      <th className="text-left px-6 py-3 text-[9px] text-edp-sub font-extrabold uppercase tracking-widest">Tipo</th>
                      <th className="text-left px-6 py-3 text-[9px] text-edp-sub font-extrabold uppercase tracking-widest">Mensagem</th>
                      <th className="text-right px-6 py-3 text-[9px] text-edp-sub font-extrabold uppercase tracking-widest">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((log, i) => {
                      const c = cfg(log.tipo);
                      return (
                        <tr key={log.id} className={`border-b border-edp-border/40 hover:bg-edp-surface/50 transition-colors ${i % 2 === 0 ? "" : "bg-edp-surface/20"}`}>
                          <td className="px-6 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-extrabold border capitalize ${c.cor}`}>
                              <span>{c.icon}</span>
                              {log.tipo}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-xs text-edp-text font-medium">{log.mensagem}</td>
                          <td className="px-6 py-3 text-right">
                            <span className="text-[10px] text-edp-sub font-mono">{log.timestamp}</span>
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
      </main>
    </div>
  );
}
