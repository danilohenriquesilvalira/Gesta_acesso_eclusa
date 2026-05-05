import { useState, useRef, useEffect } from "react";

interface Props {
  apiUrl:        string;
  onLogin:       (username: string) => void;
  onIrUtilizadores: () => void;
  semUtilizadores:  boolean;
}

export default function LoginPage({ apiUrl, onLogin, onIrUtilizadores, semUtilizadores }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [erro,     setErro]     = useState("");
  const [loading,  setLoading]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    setErro("");
    try {
      const r = await fetch(`${apiUrl}/auth/login`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username: username.trim(), password }),
      });
      const data = await r.json();
      if (data.ok) {
        onLogin(username.trim());
      } else {
        setErro(data.erro ?? "Credenciais inválidas.");
      }
    } catch {
      setErro("Sem ligação à API. Verifique a rede.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-edp-bg">

      {/* Logo + título */}
      <div className="flex flex-col items-center gap-2 mb-10">
        <div className="w-16 h-16 bg-edp-red rounded-xl flex items-center justify-center font-black text-white text-2xl tracking-tight shadow-lg">
          EDP
        </div>
        <p className="text-[11px] text-edp-muted uppercase tracking-widest">Energias de Portugal</p>
        <h1 className="text-xl font-bold text-white tracking-wide">Sistema de Controlo de Acesso</h1>
        <p className="text-xs text-edp-muted">Eclusas WinCC — Produção Hidroelétrica</p>
      </div>

      {/* Card de login */}
      <div className="bg-edp-card border border-edp-border rounded-2xl p-8 w-full max-w-sm shadow-2xl">

        {semUtilizadores ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-12 h-12 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center text-yellow-400 text-xl">!</div>
            <p className="text-white font-semibold text-center">Nenhum utilizador registado.</p>
            <p className="text-edp-muted text-xs text-center">Crie o primeiro utilizador para começar a utilizar o sistema.</p>
            <button
              onClick={onIrUtilizadores}
              className="w-full py-3 rounded-lg bg-edp-green hover:bg-green-500 text-white font-bold text-sm transition-colors cursor-pointer"
            >
              + Criar Primeiro Utilizador
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-base font-bold text-white mb-6 text-center">Autenticação</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">

              <div>
                <label className="block text-[10px] text-edp-muted uppercase tracking-wider mb-1.5">
                  Utilizador
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Nome de utilizador"
                  autoComplete="username"
                  className="w-full bg-edp-bg border border-edp-border focus:border-edp-green/60 rounded-lg px-3 py-2.5 text-white placeholder-edp-muted focus:outline-none text-sm transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] text-edp-muted uppercase tracking-wider mb-1.5">
                  Senha
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full bg-edp-bg border border-edp-border focus:border-edp-green/60 rounded-lg px-3 py-2.5 text-white placeholder-edp-muted focus:outline-none text-sm transition-colors"
                />
              </div>

              {erro && (
                <div className="px-3 py-2 rounded-lg bg-red-900/30 border border-edp-red/40 text-red-300 text-xs">
                  {erro}
                </div>
              )}

              <button
                type="submit"
                disabled={!username || !password || loading}
                className="w-full py-3 rounded-lg bg-edp-green hover:bg-green-500 disabled:bg-edp-border disabled:text-edp-muted disabled:cursor-not-allowed text-white font-bold text-sm tracking-wide transition-colors cursor-pointer mt-1"
              >
                {loading ? "A verificar..." : "▶  Entrar"}
              </button>
            </form>

            <button
              onClick={onIrUtilizadores}
              className="w-full mt-4 text-[10px] text-edp-muted hover:text-white transition-colors cursor-pointer text-center"
            >
              Gerir utilizadores
            </button>
          </>
        )}
      </div>
    </div>
  );
}
