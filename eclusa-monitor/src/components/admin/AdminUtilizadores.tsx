import { useState, useEffect } from "react";

interface Utilizador { username: string; criado_em: string; }

interface Props {
  apiUrl: string;
}

export default function AdminUtilizadores({ apiUrl }: Props) {
  const [lista,        setLista]        = useState<Utilizador[]>([]);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [username,     setUsername]     = useState("");
  const [password,     setPassword]     = useState("");
  const [confirmar,    setConfirmar]    = useState("");
  const [erro,         setErro]         = useState("");
  const [info,         setInfo]         = useState("");
  const [loading,      setLoading]      = useState(false);

  const carregar = async () => {
    try {
      const r = await fetch(`${apiUrl}/usuarios`);
      setLista(await r.json());
    } catch { /* sem ligacao */ }
  };

  useEffect(() => { carregar(); }, []);

  const abrirDialog = () => {
    setUsername(""); setPassword(""); setConfirmar(""); setErro(""); setInfo("");
    setDialogAberto(true);
  };

  const fecharDialog = () => { setDialogAberto(false); setErro(""); setInfo(""); };

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(""); setInfo("");
    if (!username.trim())       { setErro("Nome de utilizador obrigatorio."); return; }
    if (!password)              { setErro("Senha obrigatoria."); return; }
    if (password !== confirmar) { setErro("As senhas nao coincidem."); return; }
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
        setTimeout(() => fecharDialog(), 1200);
      } else {
        setErro(data.erro ?? "Erro ao criar utilizador.");
      }
    } catch { setErro("Sem ligacao a API."); }
    finally { setLoading(false); }
  };

  const handleApagar = async (u: string) => {
    if (!window.confirm(`Apagar o utilizador "${u}"? Esta acao nao pode ser desfeita.`)) return;
    try {
      const r    = await fetch(`${apiUrl}/usuarios/${encodeURIComponent(u)}`, { method: "DELETE" });
      const data = await r.json();
      if (data.ok) carregar();
    } catch { /* sem ligacao */ }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-6 py-5">

      {/* Card principal */}
      <div
        className="flex-1 rounded-2xl overflow-hidden flex flex-col"
        style={{ background: "#FFFFFF", border: "1px solid #C8D8EE", boxShadow: "0 2px 16px rgba(0,0,0,0.08)" }}
      >
        {/* Cabecalho do card — fundo claro, texto escuro */}
        <div
          className="shrink-0 px-8 py-5 flex items-center justify-between"
          style={{ background: "#F8FAFD", borderBottom: "2px solid #C8D8EE" }}
        >
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.22em]" style={{ color: "#1B2F48" }}>
              Administracao do Sistema
            </p>
            <p className="text-[22px] font-black leading-tight mt-0.5" style={{ color: "#1B2F48" }}>
              Utilizadores Registados
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div
              className="flex items-center gap-2 px-4 py-2 rounded-full"
              style={{ background: "#EEF3FB", border: "1px solid #C8D8EE" }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: "#00A651" }} />
              <span className="font-extrabold text-[14px]" style={{ color: "#1B2F48" }}>{lista.length}</span>
              <span className="text-[11px] font-semibold" style={{ color: "#7A94C1" }}>
                {lista.length === 1 ? "utilizador" : "utilizadores"}
              </span>
            </div>
            <button
              onClick={abrirDialog}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-extrabold text-[13px] text-white transition-all cursor-pointer"
              style={{ background: "#1B2F48" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#0f1e2e"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#1B2F48"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Novo Utilizador
            </button>
          </div>
        </div>

        {/* Tabela */}
        <div className="flex-1 overflow-auto">
          {lista.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "#EEF3FB" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7A94C1" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <p className="text-[14px] font-bold" style={{ color: "#7A94C1" }}>Nenhum utilizador registado</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0" style={{ background: "#1B2F48" }}>
                <tr>
                  <th className="text-left px-8 py-3.5 text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: "#FFFFFF" }}>Utilizador</th>
                  <th className="text-center px-8 py-3.5 text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: "#FFFFFF" }}>Criado em</th>
                  <th className="text-center px-8 py-3.5 text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: "#FFFFFF" }}>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((u, i) => (
                  <tr
                    key={u.username}
                    style={{ borderBottom: "1px solid #EEF3FB", background: i % 2 === 1 ? "#F8FAFD" : "#FFFFFF" }}
                  >
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-4">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-[15px] shrink-0"
                          style={{ background: "#1B2F48", color: "#FFFFFF" }}
                        >
                          {u.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-[15px] font-extrabold" style={{ color: "#000000" }}>{u.username}</p>
                          {u.username.toLowerCase() === "admin" && (
                            <p className="text-[9px] font-extrabold uppercase tracking-wider" style={{ color: "#00A651" }}>Administrador</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-4 text-center align-middle">
                      <span className="text-[13px] font-mono" style={{ color: "#000000" }}>{u.criado_em}</span>
                    </td>
                    <td className="px-8 py-4 text-right align-middle">
                      <button
                        onClick={() => handleApagar(u.username)}
                        className="px-4 py-2 rounded-lg text-[12px] font-bold transition-all cursor-pointer text-white"
                        style={{ background: "#E30613" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#c0000f"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#E30613"; }}
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

      {/* Dialog: Novo Utilizador */}
      {dialogAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) fecharDialog(); }}
        >
          <div
            className="w-[420px] rounded-2xl overflow-hidden"
            style={{ background: "#FFFFFF", boxShadow: "0 24px 60px rgba(0,0,0,0.3)" }}
          >
            <div className="px-7 py-5 flex items-center justify-between" style={{ background: "#1B2F48" }}>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.45)" }}>Novo Acesso</p>
                <p className="text-[20px] font-black text-white leading-tight mt-0.5">Criar Utilizador</p>
              </div>
              <button
                onClick={fecharDialog}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer"
                style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.15)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <form onSubmit={handleCriar} className="p-7 flex flex-col gap-5">
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-[0.18em] mb-2" style={{ color: "#7A94C1" }}>Utilizador</label>
                <input
                  type="text" value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="Nome de utilizador" autoFocus
                  className="w-full rounded-xl px-4 py-3 text-[14px] font-semibold focus:outline-none transition-all"
                  style={{ background: "#F1F5FB", border: "1px solid #C8D8EE", color: "#1B2F48" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "#1B2F48"; e.currentTarget.style.background = "#EEF3FB"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "#C8D8EE"; e.currentTarget.style.background = "#F1F5FB"; }}
                />
              </div>
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-[0.18em] mb-2" style={{ color: "#7A94C1" }}>Senha</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Senha segura"
                  className="w-full rounded-xl px-4 py-3 text-[14px] font-semibold focus:outline-none transition-all"
                  style={{ background: "#F1F5FB", border: "1px solid #C8D8EE", color: "#1B2F48" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "#1B2F48"; e.currentTarget.style.background = "#EEF3FB"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "#C8D8EE"; e.currentTarget.style.background = "#F1F5FB"; }}
                />
              </div>
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-[0.18em] mb-2" style={{ color: "#7A94C1" }}>Confirmar Senha</label>
                <input
                  type="password" value={confirmar} onChange={e => setConfirmar(e.target.value)}
                  placeholder="Repetir senha"
                  className="w-full rounded-xl px-4 py-3 text-[14px] font-semibold focus:outline-none transition-all"
                  style={{ background: "#F1F5FB", border: "1px solid #C8D8EE", color: "#1B2F48" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "#1B2F48"; e.currentTarget.style.background = "#EEF3FB"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "#C8D8EE"; e.currentTarget.style.background = "#F1F5FB"; }}
                />
              </div>

              {erro && (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl" style={{ background: "rgba(227,6,19,0.07)", border: "1px solid rgba(227,6,19,0.2)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E30613" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <p className="text-[12px] font-semibold" style={{ color: "#E30613" }}>{erro}</p>
                </div>
              )}
              {info && (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl" style={{ background: "rgba(0,166,81,0.07)", border: "1px solid rgba(0,166,81,0.2)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00A651" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <p className="text-[12px] font-semibold" style={{ color: "#00A651" }}>{info}</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button" onClick={fecharDialog}
                  className="flex-1 py-3 rounded-xl font-extrabold text-[13px] transition-all cursor-pointer"
                  style={{ background: "#EEF3FB", border: "1px solid #C8D8EE", color: "#64748B" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#C8D8EE"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#EEF3FB"; }}
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={loading}
                  className="flex-1 py-3 rounded-xl font-extrabold text-[13px] text-white transition-all cursor-pointer"
                  style={{ background: loading ? "#C8D8EE" : "#E30613", opacity: loading ? 0.7 : 1 }}
                >
                  {loading ? "A criar..." : "Criar Utilizador"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}