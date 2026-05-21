import { useState, useEffect } from "react";
import TabelaAdmin, { type ColunaConfig } from "./TabelaAdmin";

interface EntradaBlacklist {
  id:         number;
  ip:         string;
  reason:     string | null;
  active:     boolean;
  created_at: string;
}

// Cache module-level — sobrevive a navegação entre páginas
let _cachedBlacklist: EntradaBlacklist[] = [];

interface Props { apiUrl: string; token: string; }

type FiltroId = "todos" | "ativas" | "inativas";
const PER_PAGE = 12;

export default function AdminBlacklist({ apiUrl, token }: Props) {
  const [lista,    setLista]    = useState<EntradaBlacklist[]>(_cachedBlacklist);
  const [ip,       setIp]       = useState("");
  const [reason,   setReason]   = useState("");
  const [erro,     setErro]     = useState("");
  const [info,     setInfo]     = useState("");
  const [loading,  setLoading]  = useState(false);
  const [pesquisa, setPesquisa] = useState("");
  const [filtro,   setFiltro]   = useState<FiltroId>("todos");
  const [page,     setPage]     = useState(1);

  const hdrs = () => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  const carregar = async () => {
    try {
      const r    = await fetch(`${apiUrl}/blacklist`, { headers: hdrs() });
      const data = await r.json();
      _cachedBlacklist = Array.isArray(data) ? data : [];
      setLista(_cachedBlacklist);
    } catch { /* sem ligação */ }
  };

  useEffect(() => { carregar(); }, []);
  useEffect(() => { setPage(1); }, [pesquisa, filtro]);

  const handleBloquear = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(""); setInfo("");
    const ipTrimmed = ip.trim();
    if (!ipTrimmed) { setErro("Endereço IP obrigatório."); return; }
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ipTrimmed)) {
      setErro("Formato inválido — ex: 172.29.164.99"); return;
    }
    setLoading(true);
    try {
      const r    = await fetch(`${apiUrl}/blacklist`, {
        method: "POST", headers: hdrs(),
        body: JSON.stringify({ ip: ipTrimmed, reason: reason.trim() || null }),
      });
      const data = await r.json();
      if (data.ok) {
        setInfo(`IP ${ipTrimmed} bloqueado.`);
        setIp(""); setReason("");
        carregar();
        setTimeout(() => setInfo(""), 4000);
      } else {
        setErro(data.erro ?? "Erro ao bloquear IP.");
      }
    } catch { setErro("Sem ligação à API."); }
    finally  { setLoading(false); }
  };

  const handleLibertar = async (entrada: EntradaBlacklist) => {
    if (!window.confirm(`Libertar o IP ${entrada.ip}?\nO utilizador voltará a poder fazer login.`)) return;
    try {
      const r    = await fetch(`${apiUrl}/blacklist/${entrada.id}`, { method: "DELETE", headers: hdrs() });
      const data = await r.json();
      if (data.ok) carregar();
    } catch { /* sem ligação */ }
  };

  const fmt = (iso: string) => {
    try { return new Date(iso).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }); }
    catch { return "—"; }
  };

  const ativas   = lista.filter(e => e.active);
  const inativas = lista.filter(e => !e.active);

  const filtrada = (() => {
    const base = filtro === "ativas" ? ativas : filtro === "inativas" ? inativas : lista;
    const q = pesquisa.trim().toLowerCase();
    if (!q) return base;
    return base.filter(e => e.ip.toLowerCase().includes(q) || (e.reason ?? "").toLowerCase().includes(q));
  })();

  const paginados = filtrada.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const FILTROS: { id: FiltroId; label: string; count: number }[] = [
    { id: "todos",    label: "Todos",      count: lista.length    },
    { id: "ativas",   label: "Bloqueados", count: ativas.length   },
    { id: "inativas", label: "Libertados", count: inativas.length },
  ];

  const inputStyle = { background: "#F1F4F4", border: "1px solid #D7DFE0", color: "#212E3E" };

  // ── Definição de colunas ────────────────────────────────────────────────────

  const colunas: ColunaConfig<EntradaBlacklist>[] = [
    {
      header: "Endereço IP",
      width:  "minmax(0,2fr)",
      render: e => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(33,46,62,0.1)", color: "#212E3E" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <span className="font-mono font-extrabold text-[13px]"
            style={{ color: e.active ? "#E32C2C" : "#212E3E" }}>
            {e.ip}
          </span>
        </div>
      ),
    },
    {
      header: "Motivo",
      width:  "minmax(0,3fr)",
      render: e => (
        <span className="text-[12px] pr-4 truncate block" style={{ color: e.reason ? "#212E3E" : "#BECACC" }}
          title={e.reason ?? undefined}>
          {e.reason ?? "Sem motivo registado"}
        </span>
      ),
    },
    {
      header: "Estado",
      width:  "minmax(0,1.4fr)",
      center: true,
      render: e => (
        <span className="flex items-center justify-center gap-1.5 text-[12px] font-bold"
          style={{ color: e.active ? "#E32C2C" : "#7C9599" }}>
          <span className="w-2 h-2 rounded-full" style={{ background: e.active ? "#E32C2C" : "#7C9599" }} />
          {e.active ? "Bloqueado" : "Libertado"}
        </span>
      ),
    },
    {
      header: "Data",
      width:  "minmax(0,1.6fr)",
      center: true,
      render: e => (
        <span className="font-mono text-[12px]" style={{ color: "#212E3E" }}>{fmt(e.created_at)}</span>
      ),
    },
    {
      header: "Acção",
      width:  "minmax(0,1.2fr)",
      center: true,
      render: e => e.active ? (
        <button onClick={() => handleLibertar(e)}
          className="px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer"
          style={{ background: "rgba(34,94,102,0.08)", border: "1px solid rgba(34,94,102,0.2)", color: "#225E66" }}
          onMouseEnter={ev => { (ev.currentTarget as HTMLButtonElement).style.background = "rgba(34,94,102,0.16)"; }}
          onMouseLeave={ev => { (ev.currentTarget as HTMLButtonElement).style.background = "rgba(34,94,102,0.08)"; }}>
          Libertar
        </button>
      ) : (
        <span style={{ color: "#C8D4D5" }}>—</span>
      ),
    },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-8 pt-6 pb-5 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.25em]"
            style={{ color: "rgba(255,255,255,0.3)" }}>Segurança de Acesso</p>
          <h1 className="text-[26px] font-black text-white mt-0.5 leading-tight">Blacklist de IPs</h1>
        </div>
        <div className="flex items-center gap-2 mt-2 px-4 py-2 rounded-xl"
          style={{
            background: ativas.length > 0 ? "rgba(227,44,44,0.12)" : "rgba(255,255,255,0.08)",
            border: `1px solid ${ativas.length > 0 ? "rgba(227,44,44,0.35)" : "rgba(255,255,255,0.12)"}`,
          }}>
          <span className="w-2 h-2 rounded-full" style={{ background: ativas.length > 0 ? "#E32C2C" : "#7C9599" }} />
          <span className="text-[14px] font-extrabold" style={{ color: ativas.length > 0 ? "#E32C2C" : "rgba(255,255,255,0.5)" }}>
            {ativas.length}
          </span>
          <span className="text-[11px] font-semibold" style={{ color: ativas.length > 0 ? "#E32C2C" : "rgba(255,255,255,0.35)" }}>
            {ativas.length === 1 ? "IP bloqueado" : "IPs bloqueados"}
          </span>
        </div>
      </div>

      {/* ── Estatísticas ──────────────────────────────────────────────────── */}
      <div className="shrink-0 px-8 pb-5 grid grid-cols-3 gap-3">
        {[
          { label: "Total registado", v: lista.length,    cor: "#212E3E",
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> },
          { label: "IPs bloqueados",  v: ativas.length,   cor: "#E32C2C",
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> },
          { label: "IPs libertados",  v: inativas.length, cor: "#225E66",
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> },
        ].map(({ label, v, cor, icon }) => (
          <div key={label} className="rounded-2xl px-5 py-4 flex items-center gap-4"
            style={{ background: "#FFFFFF", boxShadow: "0 1px 4px rgba(0,0,0,0.12)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: v > 0 ? `${cor}18` : "#F1F4F4", color: v > 0 ? cor : "#BECACC" }}>
              {icon}
            </div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "#7C9599" }}>{label}</p>
              <p className="text-[26px] font-black leading-none tabular-nums" style={{ color: v > 0 ? cor : "#BECACC" }}>{v}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Formulário de bloqueio ────────────────────────────────────────── */}
      <div className="shrink-0 mx-8 mb-4 rounded-2xl overflow-hidden"
        style={{ background: "#FFFFFF", borderTop: "3px solid #E32C2C", boxShadow: "0 4px 24px rgba(0,0,0,0.14)" }}>

          <div className="flex items-center gap-3 px-5 py-3.5"
            style={{ background: "#FFF8F8", borderBottom: "2px solid #E32C2C" }}>
            <div className="w-1 h-5 rounded-full" style={{ background: "#E32C2C" }} />
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em]" style={{ color: "#E32C2C" }}>
              Bloquear Endereço IP
            </p>
            <p className="text-[11px] font-medium ml-2" style={{ color: "#7C9599" }}>
              — IPs bloqueados rejeitam imediatamente qualquer login
            </p>
          </div>

          <form onSubmit={handleBloquear} className="px-5 py-4 flex items-end gap-4">
            <div style={{ minWidth: 200 }}>
              <label className="block text-[9px] font-extrabold uppercase tracking-[0.22em] mb-1.5"
                style={{ color: "#7C9599" }}>Endereço IP</label>
              <input type="text" value={ip} onChange={e => setIp(e.target.value)}
                placeholder="172.29.164.99"
                className="w-full rounded-xl px-4 py-2.5 text-[13px] font-mono font-semibold focus:outline-none"
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = "#E32C2C"; e.currentTarget.style.background = "#FFF8F8"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#D7DFE0"; e.currentTarget.style.background = "#F1F4F4"; }}
              />
            </div>
            <div className="flex-1">
              <label className="block text-[9px] font-extrabold uppercase tracking-[0.22em] mb-1.5"
                style={{ color: "#7C9599" }}>Motivo (opcional)</label>
              <input type="text" value={reason} onChange={e => setReason(e.target.value)}
                placeholder="Ex: Tentativa de acesso não autorizado"
                className="w-full rounded-xl px-4 py-2.5 text-[13px] font-semibold focus:outline-none"
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = "#E32C2C"; e.currentTarget.style.background = "#FFF8F8"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#D7DFE0"; e.currentTarget.style.background = "#F1F4F4"; }}
              />
            </div>
            <button type="submit" disabled={loading}
              className="px-5 py-2.5 rounded-xl font-extrabold text-[12px] cursor-pointer shrink-0 flex items-center gap-2"
              style={{ background: loading ? "#D7DFE0" : "#28FF52", color: loading ? "#7C9599" : "#212E3E" }}
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "#1ce047"; }}
              onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "#28FF52"; }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              {loading ? "A bloquear..." : "Bloquear IP"}
            </button>
          </form>

          {(erro || info) && (
            <div className="px-5 pb-4 flex flex-col gap-2">
              {erro && (
                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
                  style={{ background: "rgba(227,44,44,0.07)", border: "1px solid rgba(227,44,44,0.2)" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#E32C2C" strokeWidth="2.5" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <p className="text-[11px] font-semibold" style={{ color: "#E32C2C" }}>{erro}</p>
                </div>
              )}
              {info && (
                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
                  style={{ background: "rgba(34,94,102,0.07)", border: "1px solid rgba(34,94,102,0.2)" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#225E66" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <p className="text-[11px] font-semibold" style={{ color: "#225E66" }}>{info}</p>
                </div>
              )}
            </div>
          )}
        </div>

      {/* ── Tabela de histórico ───────────────────────────────────────────── */}
      <TabelaAdmin<EntradaBlacklist>
        fillHeight={true}
        className="flex-1 min-h-0 mx-8 mb-6"
        dados={paginados}
        colunas={colunas}
        keyFn={e => e.id}
        rowLeftBorder={e => e.active ? "#E32C2C" : "transparent"}
        total={filtrada.length}
        page={page}
        perPage={PER_PAGE}
        onPageChange={setPage}
        emptyTitle="Nenhum IP bloqueado"
        emptySubtitle="Usa o formulário acima para bloquear um endereço"
        emptyIcon={
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#A8C5C8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        }
        toolbar={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "#F1F4F4" }}>
                {FILTROS.map(({ id, label, count }) => {
                  const ativo = filtro === id;
                  return (
                    <button key={id} onClick={() => setFiltro(id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer transition-all"
                      style={{
                        background: ativo ? "#FFFFFF" : "transparent",
                        color:      ativo ? "#212E3E" : "#7C9599",
                        boxShadow:  ativo ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                      }}>
                      {label}
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold tabular-nums"
                        style={{ background: ativo ? "#F1F4F4" : "transparent", color: ativo ? "#455558" : "#BECACC" }}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: "#F1F4F4", border: "1px solid #E6EBEC" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7C9599" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input value={pesquisa} onChange={e => setPesquisa(e.target.value)}
                  placeholder="Pesquisar IP ou motivo..."
                  className="bg-transparent text-[12px] font-semibold focus:outline-none w-44"
                  style={{ color: "#212E3E" }}
                />
                {pesquisa && (
                  <button onClick={() => setPesquisa("")}
                    className="flex items-center justify-center cursor-pointer" style={{ color: "#7C9599" }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <span className="text-[12px] font-semibold" style={{ color: "#7C9599" }}>
              {filtrada.length} {filtrada.length === 1 ? "registo" : "registos"}
            </span>
          </div>
        }
      />
    </div>
  );
}
