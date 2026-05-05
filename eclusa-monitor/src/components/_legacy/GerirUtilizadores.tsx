import { useState, useEffect } from "react";

interface Utilizador { username: string; criado_em: string; }

interface Props {
  apiUrl:   string;
  onVoltar: () => void;
}

export default function GerirUtilizadores({ apiUrl, onVoltar }: Props) {
  const [lista,    setLista]    = useState<Utilizador[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro,     setErro]     = useState("");
  const [info,     setInfo]     = useState("");
  const [loading,  setLoading]  = useState(false);

  const carregar = async () => {
    try {
      const r = await fetch(`${apiUrl}/usuarios`);
      const data: Utilizador[] = await r.json();
      setLista(data);
    } catch { /* sem ligação */ }
  };

  useEffect(() => { carregar(); }, []);

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(""); setInfo("");
    if (!username.trim()) { setErro("Nome de utilizador obrigatório."); return; }
    if (!password)        { setErro("Senha obrigatória."); return; }
    if (password !== confirmar) { setErro("As senhas não coincidem."); return; }
    setLoading(true);
    try {
      const r = await fetch(`${apiUrl}/usuarios`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username: username.trim(), password }),
      });
      const data = await r.json();
      if (data.ok) {
        setInfo(`Utilizador "${username.trim()}" criado.`);
        setUsername(""); setPassword(""); setConfirmar("");
        carregar();
      } else {
        setErro(data.erro ?? "Erro ao criar utilizador.");
      }
    } catch {
      setErro("Sem ligação à API.");
    } finally {
      setLoading(false);
    }
  };

  const handleApagar = async (u: string) => {
    setErro(""); setInfo("");
    if (!window.confirm(`Apagar utilizador "${u}"?`)) return;
    try {
      const r = await fetch(`${apiUrl}/usuarios/${encodeURIComponent(u)}`, { method: "DELETE" });
      const data = await r.json();
      if (data.ok) { setInfo(`Utilizador "${u}" removido.`); carregar(); }
      else setErro(data.erro ?? "Erro ao remover.");
    } catch {
      setErro("Sem ligação à API.");
    }
  };

  return (
    <div className="h-screen flex flex-col bg-edp-bg">

      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-8 py-4 bg-edp-card border-b border-edp-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-edp-red rounded flex items-center justify-center font-black text-white text-xs">EDP</div>
          <h1 className="text-sm font-bold text-white">Gestão de Utilizadores</h1>
        </div>
        <button
          onClick={onVoltar}
          className="px-4 py-2 rounded-lg border border-edp-border text-edp-muted hover:text-white hover:border-edp-muted text-sm font-semibold transition-colors cursor-pointer"
        >
          ← Voltar
        </button>
      </header>

      <main className="flex-1 flex gap-6 p-8 min-h-0 overflow-auto">

        {/* Coluna esquerda — criar utilizador */}
        <div className="w-80 shrink-0">
          <div className="bg-edp-card border border-edp-border rounded-xl p-6">
            <h2 className="text-sm font-bold text-white mb-5">Novo Utilizador</h2>
            <form onSubmit={handleCriar} className="flex flex-col gap-4">

              <div>
                <label className="block text-[10px] text-edp-muted uppercase tracking-wider mb-1.5">Utilizador</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Qualquer nome"
                  className="w-full bg-edp-bg border border-edp-border focus:border-edp-green/60 rounded-lg px-3 py-2.5 text-white placeholder-edp-muted focus:outline-none text-sm transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] text-edp-muted uppercase tracking-wider mb-1.5">Senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Qualquer senha"
                  className="w-full bg-edp-bg border border-edp-border focus:border-edp-green/60 rounded-lg px-3 py-2.5 text-white placeholder-edp-muted focus:outline-none text-sm transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] text-edp-muted uppercase tracking-wider mb-1.5">Confirmar Senha</label>
                <input
                  type="password"
                  value={confirmar}
                  onChange={e => setConfirmar(e.target.value)}
                  placeholder="Repetir senha"
                  className="w-full bg-edp-bg border border-edp-border focus:border-edp-green/60 rounded-lg px-3 py-2.5 text-white placeholder-edp-muted focus:outline-none text-sm transition-colors"
                />
              </div>

              {erro && <p className="text-red-400 text-xs">{erro}</p>}
              {info && <p className="text-edp-green text-xs">{info}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg bg-edp-green hover:bg-green-500 disabled:bg-edp-border disabled:text-edp-muted text-white font-bold text-sm transition-colors cursor-pointer"
              >
                {loading ? "A criar..." : "+ Criar Utilizador"}
              </button>
            </form>
          </div>
        </div>

        {/* Coluna direita — lista de utilizadores */}
        <div className="flex-1">
          <div className="bg-edp-card border border-edp-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-edp-border flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">Utilizadores Registados</h2>
              <span className="text-[10px] text-edp-muted font-mono">{lista.length} total</span>
            </div>

            {lista.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <p className="text-edp-muted text-sm">Nenhum utilizador registado.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-edp-border">
                    <th className="text-left px-6 py-3 text-[10px] text-edp-muted uppercase tracking-wider">Utilizador</th>
                    <th className="text-left px-6 py-3 text-[10px] text-edp-muted uppercase tracking-wider">Criado em</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {lista.map(u => (
                    <tr key={u.username} className="border-b border-edp-border/50 hover:bg-edp-bg/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-edp-green/20 border border-edp-green/30 flex items-center justify-center text-edp-green font-bold text-xs shrink-0">
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-white font-semibold text-sm">{u.username}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-edp-muted text-xs font-mono">{u.criado_em}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleApagar(u.username)}
                          className="px-3 py-1.5 rounded-lg border border-edp-border hover:border-edp-red/50 hover:bg-edp-red/10 text-edp-muted hover:text-red-400 text-xs font-semibold transition-colors cursor-pointer"
                        >
                          Apagar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
