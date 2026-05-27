import { useState, useEffect, useMemo } from "react";
import TabelaAdmin, { type ColunaConfig } from "./TabelaAdmin";

interface Utilizador {
  username:     string;
  display_name: string | null;
  role:         string;
  status:       string;
  last_login:   string | null;
  created_at:   string;
  sessao_ativa?: boolean;
  cliente_ativo?: string | null;
}

const ROLE_META: Record<string, { label: string; cor: string; bg: string }> = {
  admin:      { label: "Admin",      cor: "rgba(255,255,255,0.8)", bg: "rgba(255,255,255,0.1)" },
  operator:   { label: "Operador",   cor: "#64E4EE",               bg: "rgba(34,94,102,0.2)"  },
  supervisor: { label: "Supervisor", cor: "#7D8ADE",               bg: "rgba(38,60,200,0.18)" },
};
const STATUS_META: Record<string, { label: string; cor: string }> = {
  active:   { label: "Ativo",     cor: "#28FF52" },
  blocked:  { label: "Bloqueado", cor: "#E32C2C" },
  inactive: { label: "Inativo",   cor: "rgba(255,255,255,0.3)" },
};
const CLIENTE_LABEL: Record<string, string> = {
  eclusa_RG: "Régua",
  eclusa_PN: "Pocinho",
};

// Cache module-level — sobrevive a navegação entre páginas
let _cachedLista: Utilizador[] = [];

interface Props { apiUrl: string; token: string; }
const PER_PAGE = 12;

// ── Confirm Dialog ─────────────────────────────────────────────────────────────
interface ConfirmProps {
  titulo:     string;
  mensagem:   string;
  subtexto?:  string;
  variante:   "danger" | "warning";
  labelOk:    string;
  onOk:       () => void;
  onCancelar: () => void;
}

function ConfirmDialog({ titulo, mensagem, subtexto, variante, labelOk, onOk, onCancelar }: ConfirmProps) {
  const corBtn = variante === "danger" ? "#E32C2C" : "#28FF52";
  const corTxt = variante === "danger" ? "#FFFFFF" : "#212E3E";
  const iconeVariante = variante === "danger"
    ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E32C2C" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#263CC8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onCancelar(); }}>
      <div className="w-[420px] rounded-2xl overflow-hidden"
        style={{ background: "#212E3E", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}>
        <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.22em]" style={{ color: "rgba(255,255,255,0.4)" }}>Confirmação</p>
            <p className="text-[18px] font-black text-white leading-tight mt-0.5">{titulo}</p>
          </div>
          <button onClick={onCancelar}
            className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
            style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.15)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="p-6">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: variante === "danger" ? "rgba(227,44,44,0.12)" : "rgba(38,60,200,0.12)" }}>
              {iconeVariante}
            </div>
            <div>
              <p className="text-[14px] font-bold" style={{ color: "rgba(255,255,255,0.85)" }}>{mensagem}</p>
              {subtexto && <p className="text-[12px] mt-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>{subtexto}</p>}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={onCancelar}
              className="flex-1 py-3 rounded-xl font-extrabold text-[13px] cursor-pointer"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}>
              Cancelar
            </button>
            <button onClick={() => { onOk(); onCancelar(); }}
              className="flex-1 py-3 rounded-xl font-extrabold text-[13px] cursor-pointer"
              style={{ background: corBtn, color: corTxt }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  variante === "danger" ? "#c0000f" : "#1ce047";
              }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = corBtn; }}>
              {labelOk}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function AdminUtilizadores({ apiUrl, token }: Props) {
  const [lista,     setLista]     = useState<Utilizador[]>(_cachedLista);
  const [dialog,    setDialog]    = useState(false);
  const [username,  setUsername]  = useState("");
  const [password,  setPassword]  = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [role,      setRole]      = useState("operator");
  const [erro,      setErro]      = useState("");
  const [info,      setInfo]      = useState("");
  const [loading,   setLoading]   = useState(false);
  const [pesquisa,  setPesquisa]  = useState("");
  const [page,      setPage]      = useState(1);
  const [confirm,   setConfirm]   = useState<ConfirmProps | null>(null);

  const filtrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase();
    return q
      ? lista.filter(u => u.username.toLowerCase().includes(q) || (u.display_name ?? "").toLowerCase().includes(q))
      : lista;
  }, [lista, pesquisa]);

  const paginados = filtrados.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const hdrs = () => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  const carregar = async () => {
    try {
      const r    = await fetch(`${apiUrl}/usuarios`, { headers: hdrs() });
      const data = await r.json();
      _cachedLista = Array.isArray(data) ? data : [];
      setLista(_cachedLista);
    } catch { /* sem ligação */ }
  };

  useEffect(() => { if (token) carregar(); }, [token]);
  useEffect(() => { setPage(1); }, [pesquisa]);

  // Auto-refresh quando há sessões activas (verifica a cada 8s)
  useEffect(() => {
    if (!lista.some(u => u.sessao_ativa)) return;
    const id = setInterval(carregar, 8_000);
    return () => clearInterval(id);
  }, [lista]);

  const abrirDialog = () => {
    setUsername(""); setPassword(""); setConfirmar(""); setRole("operator");
    setErro(""); setInfo(""); setDialog(true);
  };
  const fecharDialog = () => { setDialog(false); setErro(""); setInfo(""); };

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(""); setInfo("");
    if (!username.trim())       { setErro("Nome de utilizador obrigatório."); return; }
    if (!password)              { setErro("Senha obrigatória."); return; }
    if (password.length < 8)   { setErro("Senha mínimo 8 caracteres."); return; }
    if (password !== confirmar) { setErro("As senhas não coincidem."); return; }
    setLoading(true);
    try {
      const r    = await fetch(`${apiUrl}/usuarios`, {
        method: "POST", headers: hdrs(),
        body: JSON.stringify({ username: username.trim(), password, role }),
      });
      const data = await r.json();
      if (data.ok) {
        setInfo(`Utilizador "${username.trim()}" criado.`);
        setUsername(""); setPassword(""); setConfirmar("");
        carregar();
        setTimeout(fecharDialog, 1200);
      } else {
        setErro(data.erro ?? "Erro ao criar utilizador.");
      }
    } catch { setErro("Sem ligação à API."); }
    finally  { setLoading(false); }
  };

  const handleToggleBloqueio = (u: Utilizador) => {
    const bloquear = u.status === "active";
    setConfirm({
      titulo:    bloquear ? "Bloquear Utilizador" : "Reativar Utilizador",
      mensagem:  bloquear ? `Bloquear "${u.username}"?` : `Reativar "${u.username}"?`,
      subtexto:  bloquear
        ? "O utilizador não poderá fazer login enquanto estiver bloqueado."
        : "O utilizador voltará a poder autenticar-se no sistema.",
      variante:  bloquear ? "danger" : "warning",
      labelOk:   bloquear ? "Bloquear" : "Reativar",
      onOk: async () => {
        const novoStatus = bloquear ? "blocked" : "active";
        try {
          const r    = await fetch(`${apiUrl}/usuarios/${encodeURIComponent(u.username)}`, {
            method: "PUT", headers: hdrs(),
            body: JSON.stringify({ status: novoStatus }),
          });
          const data = await r.json();
          if (data.ok) carregar();
        } catch { /* sem ligação */ }
      },
      onCancelar: () => setConfirm(null),
    });
  };

  const handleApagar = (u: Utilizador) => {
    setConfirm({
      titulo:   "Remover Utilizador",
      mensagem: `Remover permanentemente "${u.username}"?`,
      subtexto: "Esta acção não pode ser desfeita. Todos os dados do utilizador serão eliminados.",
      variante: "danger",
      labelOk:  "Remover",
      onOk: async () => {
        try {
          const r    = await fetch(`${apiUrl}/usuarios/${encodeURIComponent(u.username)}`, {
            method: "DELETE", headers: hdrs(),
          });
          const data = await r.json();
          if (data.ok) carregar();
        } catch { /* sem ligação */ }
      },
      onCancelar: () => setConfirm(null),
    });
  };

  const handleForceLogout = (u: Utilizador) => {
    const cliente = u.cliente_ativo ? ` (${CLIENTE_LABEL[u.cliente_ativo] ?? u.cliente_ativo})` : "";
    setConfirm({
      titulo:   "Forçar Saída",
      mensagem: `Encerrar sessão de "${u.username}"${cliente}?`,
      subtexto: "O utilizador será desligado imediatamente e o seu token invalidado. Terá de autenticar-se novamente.",
      variante: "danger",
      labelOk:  "Forçar Saída",
      onOk: async () => {
        try {
          await fetch(`${apiUrl}/admin/force-logout`, {
            method: "POST", headers: hdrs(),
            body: JSON.stringify({ username: u.username }),
          });
          carregar();
        } catch { /* sem ligação */ }
      },
      onCancelar: () => setConfirm(null),
    });
  };

  const fmt = (iso: string | null) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }); }
    catch { return "—"; }
  };

  // ── Definição de colunas ────────────────────────────────────────────────────

  const colunas: ColunaConfig<Utilizador>[] = [
    {
      header: "Utilizador",
      width:  "minmax(0,3fr)",
      render: u => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center font-extrabold text-[14px] shrink-0"
            style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}>
            {u.username.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-bold leading-tight" style={{ color: "rgba(255,255,255,0.85)" }}>
                {u.username}
              </p>
              {u.sessao_ativa && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold"
                  style={{ background: "rgba(40,255,82,0.15)", color: "#28FF52", border: "1px solid rgba(40,255,82,0.3)" }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#28FF52" }} />
                  {u.cliente_ativo ? CLIENTE_LABEL[u.cliente_ativo] ?? u.cliente_ativo : "em sessão"}
                </span>
              )}
            </div>
            {u.display_name && u.display_name !== u.username && (
              <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{u.display_name}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      header: "Perfil",
      width:  "minmax(0,1.2fr)",
      center: true,
      render: u => {
        const m = ROLE_META[u.role] ?? { label: u.role, cor: "#7C9599", bg: "rgba(124,149,153,0.15)" };
        return (
          <span className="px-3 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wide"
            style={{ background: m.bg, color: m.cor }}>{m.label}</span>
        );
      },
    },
    {
      header: "Estado",
      width:  "minmax(0,1fr)",
      center: true,
      render: u => {
        const m = STATUS_META[u.status] ?? { label: u.status, cor: "#7C9599" };
        return (
          <span className="flex items-center justify-center gap-1.5 text-[12px] font-bold"
            style={{ color: m.cor }}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: m.cor }} />
            {m.label}
          </span>
        );
      },
    },
    {
      header: "Último Login",
      width:  "minmax(0,1.5fr)",
      center: true,
      render: u => (
        <span className="font-mono text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>{fmt(u.last_login)}</span>
      ),
    },
    {
      header: "Criado em",
      width:  "minmax(0,1.5fr)",
      center: true,
      render: u => (
        <span className="font-mono text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>{fmt(u.created_at)}</span>
      ),
    },
    {
      header: "Acções",
      width:  "minmax(0,2fr)",
      center: true,
      render: u => (
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          {u.sessao_ativa && (
            <button onClick={() => handleForceLogout(u)}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer"
              style={{ background: "rgba(227,44,44,0.08)", border: "1px solid rgba(227,44,44,0.2)", color: "#E32C2C" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(227,44,44,0.16)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(227,44,44,0.08)"; }}>
              Forçar Saída
            </button>
          )}
          <button onClick={() => handleToggleBloqueio(u)}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer"
            style={{
              background: u.status === "active" ? "rgba(227,44,44,0.07)" : "rgba(34,94,102,0.08)",
              color:      u.status === "active" ? "#E32C2C" : "#225E66",
              border:     `1px solid ${u.status === "active" ? "rgba(227,44,44,0.2)" : "rgba(34,94,102,0.2)"}`,
            }}>
            {u.status === "active" ? "Bloquear" : "Reativar"}
          </button>
          <button onClick={() => handleApagar(u)}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer text-white"
            style={{ background: "#E32C2C" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#c0000f"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#E32C2C"; }}>
            Remover
          </button>
        </div>
      ),
    },
  ];

  const inputStyle = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#FFFFFF" };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-8 pt-6 pb-5 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.22em]"
            style={{ color: "rgba(255,255,255,0.3)" }}>Administração do Sistema</p>
          <h1 className="text-[26px] font-black text-white mt-0.5 leading-tight">Utilizadores Registados</h1>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
            <span className="w-2 h-2 rounded-full" style={{ background: "#28FF52" }} />
            <span className="font-extrabold text-[14px] text-white">{filtrados.length}</span>
            <span className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>
              {filtrados.length === 1 ? "utilizador" : "utilizadores"}
            </span>
          </div>
          <button onClick={abrirDialog}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-extrabold text-[13px] cursor-pointer"
            style={{ background: "#28FF52", color: "#212E3E" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#1ce047"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#28FF52"; }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Novo Utilizador
          </button>
        </div>
      </div>

      {/* ── Estatísticas ──────────────────────────────────────────────────── */}
      <div className="shrink-0 px-8 pb-5 grid grid-cols-4 gap-3">
        {[
          { label: "Total",      v: lista.length,                                     cor: "rgba(255,255,255,0.8)",
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
          { label: "Ativos",     v: lista.filter(u => u.status === "active").length,  cor: "#28FF52",
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> },
          { label: "Bloqueados", v: lista.filter(u => u.status === "blocked").length, cor: "#E32C2C",
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> },
          { label: "Admins",     v: lista.filter(u => u.role === "admin").length,     cor: "#7D8ADE",
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
        ].map(({ label, v, cor, icon }) => (
          <div key={label} className="rounded-2xl px-5 py-4 flex items-center gap-4"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: v > 0 ? `${cor}22` : "rgba(255,255,255,0.04)", color: v > 0 ? cor : "rgba(255,255,255,0.2)" }}>
              {icon}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</p>
              <p className="text-[28px] font-black leading-none tabular-nums mt-0.5" style={{ color: v > 0 ? cor : "rgba(255,255,255,0.2)" }}>{v}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabela ────────────────────────────────────────────────────────── */}
      <TabelaAdmin<Utilizador>
        className="flex-1 mx-8 mb-6"
        dados={paginados}
        colunas={colunas}
        keyFn={u => u.username}
        rowLeftBorder={u => u.sessao_ativa ? "#28FF52" : u.status === "blocked" ? "#E32C2C" : "transparent"}
        total={filtrados.length}
        page={page}
        perPage={PER_PAGE}
        onPageChange={setPage}
        emptyTitle="Nenhum utilizador registado"
        emptySubtitle="Cria o primeiro utilizador com o botão acima"
        emptyIcon={
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#A8C5C8" strokeWidth="1.5" strokeLinecap="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
        }
        toolbar={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input value={pesquisa} onChange={e => setPesquisa(e.target.value)}
                placeholder="Pesquisar utilizador..."
                className="bg-transparent text-[12px] font-semibold focus:outline-none w-44 placeholder:text-white/20"
                style={{ color: "rgba(255,255,255,0.8)" }}
              />
              {pesquisa && (
                <button onClick={() => setPesquisa("")}
                  className="flex items-center justify-center cursor-pointer" style={{ color: "rgba(255,255,255,0.4)" }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>
            <span className="text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.3)" }}>
              {filtrados.length} {filtrados.length === 1 ? "resultado" : "resultados"}
            </span>
          </div>
        }
      />

      {/* ── Dialog: Novo Utilizador ───────────────────────────────────────── */}
      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) fecharDialog(); }}>
          <div className="w-[440px] rounded-2xl overflow-hidden"
            style={{ background: "#212E3E", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}>

            <div className="px-7 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.45)" }}>Novo Acesso</p>
                <p className="text-[20px] font-black text-white leading-tight mt-0.5">Criar Utilizador</p>
              </div>
              <button onClick={fecharDialog}
                className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
                style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.15)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <form onSubmit={handleCriar} className="p-7 flex flex-col gap-4">
              {[
                { label: "Utilizador",      value: username,  set: setUsername,  type: "text",     ph: "Nome de utilizador" },
                { label: "Senha",           value: password,  set: setPassword,  type: "password", ph: "Senha segura (mín. 8 car.)" },
                { label: "Confirmar Senha", value: confirmar, set: setConfirmar, type: "password", ph: "Repetir senha" },
              ].map(({ label, value, set, type, ph }) => (
                <div key={label}>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</label>
                  <input type={type} value={value} onChange={e => set(e.target.value)}
                    placeholder={ph} autoFocus={label === "Utilizador"}
                    className="w-full rounded-xl px-4 py-3 text-[14px] font-semibold focus:outline-none placeholder:text-white/20"
                    style={inputStyle}
                    onFocus={e => { e.currentTarget.style.borderColor = "rgba(34,94,102,0.6)"; e.currentTarget.style.background = "rgba(34,94,102,0.12)"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                  />
                </div>
              ))}

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>Perfil</label>
                <select value={role} onChange={e => setRole(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-[14px] font-semibold focus:outline-none cursor-pointer"
                  style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = "rgba(34,94,102,0.6)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}>
                  <option value="operator">Operador</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              {erro && (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
                  style={{ background: "rgba(227,44,44,0.07)", border: "1px solid rgba(227,44,44,0.2)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E32C2C" strokeWidth="2.5" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <p className="text-[12px] font-semibold" style={{ color: "#E32C2C" }}>{erro}</p>
                </div>
              )}
              {info && (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
                  style={{ background: "rgba(34,94,102,0.07)", border: "1px solid rgba(34,94,102,0.2)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#225E66" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <p className="text-[12px] font-semibold" style={{ color: "#225E66" }}>{info}</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={fecharDialog}
                  className="flex-1 py-3 rounded-xl font-extrabold text-[13px] cursor-pointer"
                  style={{ background: "#E6EBEC", border: "1px solid #D7DFE0", color: "#64748B" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#D7DFE0"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#E6EBEC"; }}>
                  Cancelar
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 py-3 rounded-xl font-extrabold text-[13px] cursor-pointer"
                  style={{ background: loading ? "#D7DFE0" : "#28FF52", color: loading ? "#7C9599" : "#212E3E", opacity: loading ? 0.7 : 1 }}>
                  {loading ? "A criar..." : "Criar Utilizador"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Confirm Dialog ────────────────────────────────────────────────── */}
      {confirm && <ConfirmDialog {...confirm} />}
    </div>
  );
}
