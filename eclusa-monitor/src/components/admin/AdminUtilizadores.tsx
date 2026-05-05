import { useState, useEffect } from "react";

interface Utilizador { username: string; criado_em: string; }

interface Props {
  apiUrl:  string;
  onVoltar: () => void;
}

export default function AdminUtilizadores({ apiUrl, onVoltar }: Props) {
  const [lista,     setLista]     = useState<Utilizador[]>([]);
  const [username,  setUsername]  = useState("");
  const [password,  setPassword]  = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro,      setErro]      = useState("");
  const [info,      setInfo]      = useState("");
  const [loading,   setLoading]   = useState(false);

  const carregar = async () => {
    try {
      const r = await fetch(`${apiUrl}/usuarios`);
      setLista(await r.json());
    } catch { /* sem ligação */ }
  };

  useEffect(() => { carregar(); }, []);

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(""); setInfo("");
    if (!username.trim())         { setErro("Nome de utilizador obrigatório."); return; }
    if (!password)                { setErro("Senha obrigatória."); return; }
    if (password !== confirmar)   { setErro("As senhas não coincidem."); return; }
    setLoading(true);
    try {
      const r    = await fetch(`${apiUrl}/usuarios`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username: username.trim(), password }),
      });
      const data = await r.json();
      if (data.ok) {
        setInfo(`Utilizador "${username.trim()}" criado com sucesso.`);
        setUsername(""); setPassword(""); setConfirmar("");
        carregar();
      } else {
        setErro(data.erro ?? "Erro ao criar utilizador.");
      }
    } catch { setErro("Sem ligação à API."); }
    finally   { setLoading(false); }
  };

  const handleApagar = async (u: string) => {
    setErro(""); setInfo("");
    if (!window.confirm(`Apagar o utilizador "${u}"? Esta ação não pode ser desfeita.`)) return;
    try {
      const r = await fetch(`${apiUrl}/usuarios/${encodeURIComponent(u)}`, { method: "DELETE" });
      const data = await r.json();
      if (data.ok) { setInfo(`Utilizador "${u}" removido.`); carregar(); }
      else setErro(data.erro ?? "Erro ao remover.");
    } catch { setErro("Sem ligação à API."); }
  };

  return (
    <div className="h-screen flex flex-col font-sans overflow-hidden" style={{ background: "#212E3E" }}>

      {/* Faixa topo admin */}
      <div className="shrink-0 border-b border-white/10 px-6 py-3 flex items-center justify-between" style={{ background: "#212E3E" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-edp-red rounded-lg flex items-center justify-center">
            <span className="text-white font-black text-xs">EDP</span>
          </div>
          <div>
            <p className="text-xs font-extrabold text-white leading-none">Gestão de Utilizadores</p>
            <p className="text-[9px] text-white/35 mt-0.5">Administração do Sistema</p>
          </div>
        </div>
        <button
          onClick={onVoltar}
          className="px-4 py-1.5 rounded-lg border border-white/15 text-white/60 hover:text-white hover:border-white/40 text-xs font-bold transition-all cursor-pointer"
        >
          ← Voltar ao Dashboard
        </button>
      </div>

      <main className="flex-1 flex gap-5 p-6 min-h-0 overflow-hidden">

        {/* Criar utilizador */}
        <div className="w-72 shrink-0">
          <div className="bg-edp-card rounded-2xl border border-edp-border shadow-md overflow-hidden">
            <div className="bg-edp-surface border-b border-edp-border px-5 py-4">
              <h2 className="text-sm font-extrabold text-edp-text">Novo Utilizador</h2>
              <p className="text-[10px] text-edp-sub mt-0.5">Criar conta de acesso ao sistema</p>
            </div>
            <form onSubmit={handleCriar} className="p-5 flex flex-col gap-4">
              <div>
                <label className="block text-[9px] text-edp-sub font-extrabold uppercase tracking-widest mb-1.5">Utilizador</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Nome de utilizador"
                  className="w-full border border-edp-border rounded-xl px-3 py-2.5 text-edp-text placeholder-edp-sub/40 focus:outline-none focus:border-edp-blue focus:ring-1 focus:ring-edp-blue/20 text-sm transition-all"
                />
              </div>
              <div>
                <label className="block text-[9px] text-edp-sub font-extrabold uppercase tracking-widest mb-1.5">Senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Senha segura"
                  className="w-full border border-edp-border rounded-xl px-3 py-2.5 text-edp-text placeholder-edp-sub/40 focus:outline-none focus:border-edp-blue focus:ring-1 focus:ring-edp-blue/20 text-sm transition-all"
                />
              </div>
              <div>
                <label className="block text-[9px] text-edp-sub font-extrabold uppercase tracking-widest mb-1.5">Confirmar Senha</label>
                <input
                  type="password"
                  value={confirmar}
                  onChange={e => setConfirmar(e.target.value)}
                  placeholder="Repetir senha"
                  className="w-full border border-edp-border rounded-xl px-3 py-2.5 text-edp-text placeholder-edp-sub/40 focus:outline-none focus:border-edp-blue focus:ring-1 focus:ring-edp-blue/20 text-sm transition-all"
                />
              </div>

              {erro && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200">
                  <span className="text-red-500 text-xs">⚠</span>
                  <p className="text-red-600 text-xs font-semibold">{erro}</p>
                </div>
              )}
              {info && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 border border-green-200">
                  <span className="text-edp-green text-xs">✓</span>
                  <p className="text-green-700 text-xs font-semibold">{info}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-edp-blue hover:bg-blue-700 disabled:bg-edp-border disabled:text-white/40 text-white font-extrabold text-sm transition-all cursor-pointer shadow-sm"
              >
                {loading ? "A criar..." : "+ Criar Utilizador"}
              </button>
            </form>
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="bg-edp-card rounded-2xl border border-edp-border shadow-md overflow-hidden flex flex-col flex-1">
            <div className="bg-edp-surface border-b border-edp-border px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-extrabold text-edp-text">Utilizadores Registados</h2>
                <p className="text-[10px] text-edp-sub mt-0.5">Todos os operadores com acesso ao sistema</p>
              </div>
              <span className="px-3 py-1 rounded-full bg-edp-blue/10 text-edp-blue text-xs font-extrabold border border-edp-blue/20">
                {lista.length} {lista.length === 1 ? "utilizador" : "utilizadores"}
              </span>
            </div>

            <div className="flex-1 overflow-auto">
              {lista.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <div className="w-12 h-12 rounded-full bg-edp-surface flex items-center justify-center text-edp-sub text-xl">👤</div>
                  <p className="text-edp-sub text-sm font-semibold">Nenhum utilizador registado</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-edp-surface border-b border-edp-border">
                    <tr>
                      <th className="text-left px-6 py-3 text-[9px] text-edp-sub font-extrabold uppercase tracking-widest">Utilizador</th>
                      <th className="text-left px-6 py-3 text-[9px] text-edp-sub font-extrabold uppercase tracking-widest">Criado em</th>
                      <th className="px-6 py-3 text-[9px] text-edp-sub font-extrabold uppercase tracking-widest text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((u, i) => (
                      <tr key={u.username} className={`border-b border-edp-border/50 hover:bg-edp-surface/50 transition-colors ${i % 2 === 0 ? "" : "bg-edp-surface/20"}`}>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-edp-blue/10 border border-edp-blue/20 flex items-center justify-center text-edp-blue font-extrabold text-xs">
                              {u.username.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-extrabold text-edp-text">{u.username}</p>
                              {u.username.toLowerCase() === "admin" && (
                                <p className="text-[9px] text-edp-green font-bold">Administrador</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-3.5 text-edp-sub text-xs font-mono">{u.criado_em}</td>
                        <td className="px-6 py-3.5 text-right">
                          <button
                            onClick={() => handleApagar(u.username)}
                            className="px-3 py-1.5 rounded-lg border border-edp-border hover:border-red-300 hover:bg-red-50 text-edp-sub hover:text-edp-red text-xs font-bold transition-all cursor-pointer"
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))}
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
