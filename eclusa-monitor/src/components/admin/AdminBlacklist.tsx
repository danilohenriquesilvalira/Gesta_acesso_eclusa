import { useState, useEffect } from "react";
import TabelaAdmin, { type ColunaConfig } from "./TabelaAdmin";

interface EntradaBlacklist {
  id:          number;
  ip:          string;
  reason:      string | null;
  servidor_ip: string | null;
  utilizador:  string | null;
  active:      boolean;
  created_at:  string;
}

interface Props { apiUrl: string; token: string; }

type FiltroId = "todos" | "ativas" | "inativas";
const PER_PAGE = 12;

export default function AdminBlacklist({ apiUrl, token }: Props) {
  const [lista,       setLista]       = useState<EntradaBlacklist[]>([]);
  const [ip,          setIp]          = useState("");
  const [reason,      setReason]      = useState("");
  const [erro,        setErro]        = useState("");
  const [info,        setInfo]        = useState("");
  const [loading,     setLoading]     = useState(false);
  const [pesquisa,    setPesquisa]    = useState("");
  const [filtro,      setFiltro]      = useState<FiltroId>("ativas");
  const [page,        setPage]        = useState(1);
  const [confirmar,   setConfirmar]   = useState<EntradaBlacklist | null>(null);

  const hdrs = () => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  const carregar = async () => {
    try {
      const r    = await fetch(`${apiUrl}/blacklist`, { headers: hdrs() });
      const data = await r.json();
      setLista(Array.isArray(data) ? data : []);
    } catch { /* sem ligação */ }
  };

  useEffect(() => {
    if (!token) return;
    carregar();
    const iv = setInterval(carregar, 3_000);
    return () => clearInterval(iv);
  }, [token]);
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

  const handleLibertar = (entrada: EntradaBlacklist) => setConfirmar(entrada);

  const confirmarLibertar = async () => {
    if (!confirmar) return;
    try {
      const r    = await fetch(`${apiUrl}/blacklist/${confirmar.id}`, { method: "DELETE", headers: hdrs() });
      const data = await r.json();
      if (data.ok) carregar();
    } catch { /* sem ligação */ }
    finally { setConfirmar(null); }
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
      header: "IP Bloqueado",
      width:  "minmax(0,1.8fr)",
      render: e => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: e.active ? "rgba(227,44,44,0.1)" : "rgba(33,46,62,0.08)", color: e.active ? "#E32C2C" : "#7C9599" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <span className="font-mono font-extrabold text-[13px]"
            style={{ color: e.active ? "#E32C2C" : "#7C9599" }}>
            {e.ip}
          </span>
        </div>
      ),
    },
    {
      header: "Tentou aceder a",
      width:  "minmax(0,1.4fr)",
      render: e => e.servidor_ip ? (
        <div className="flex items-center gap-1.5">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#F7D200" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          <span className="font-mono font-bold text-[12px]" style={{ color: "#F7D200" }}>{e.servidor_ip}</span>
        </div>
      ) : (
        <span className="text-[11px]" style={{ color: "#BECACC" }}>—</span>
      ),
    },
    {
      header: "Utilizador usado",
      width:  "minmax(0,1.4fr)",
      render: e => e.utilizador ? (
        <div className="flex items-center gap-1.5">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0CD3F8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          <span className="font-mono text-[12px] font-semibold" style={{ color: "#0CD3F8" }}>{e.utilizador}</span>
        </div>
      ) : (
        <span className="text-[11px]" style={{ color: "#BECACC" }}>—</span>
      ),
    },
    {
      header: "Estado",
      width:  "minmax(0,1.2fr)",
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
      width:  "minmax(0,1.4fr)",
      center: true,
      render: e => (
        <span className="font-mono text-[11px]" style={{ color: "#212E3E" }}>{fmt(e.created_at)}</span>
      ),
    },
    {
      header: "Acção",
      width:  "minmax(0,1fr)",
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

      {/* ── Dialog de confirmação ─────────────────────────────────────────── */}
      {confirmar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => setConfirmar(null)}>
          <div className="rounded-2xl p-6 w-[380px] shadow-2xl"
            style={{ background: "#212E3E", border: "1px solid rgba(227,44,44,0.3)" }}
            onClick={e => e.stopPropagation()}>

            {/* Ícone + título */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(34,94,102,0.15)", border: "1px solid rgba(34,94,102,0.3)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#225E66" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                  <line x1="12" y1="16" x2="12" y2="16.01"/>
                </svg>
              </div>
              <div>
                <p className="text-white font-black text-[15px]">Libertar IP</p>
                <p className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>
                  O acesso RDP será restaurado
                </p>
              </div>
            </div>

            {/* IP destacado */}
            <div className="rounded-xl px-4 py-3 mb-5"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-[10px] font-extrabold uppercase tracking-widest mb-1"
                style={{ color: "rgba(255,255,255,0.3)" }}>Endereço IP</p>
              <p className="font-mono font-bold text-[15px] text-white">{confirmar.ip}</p>
              {confirmar.servidor_ip && (
                <p className="text-[11px] mt-1 font-mono" style={{ color: "rgba(245,158,11,0.8)" }}>
                  Tentou aceder a {confirmar.servidor_ip}
                  {confirmar.utilizador ? ` como "${confirmar.utilizador}"` : ""}
                </p>
              )}
            </div>

            {/* Botões */}
            <div className="flex gap-3">
              <button onClick={() => setConfirmar(null)}
                className="flex-1 py-2.5 rounded-xl text-[12px] font-bold cursor-pointer"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
                Cancelar
              </button>
              <button onClick={confirmarLibertar}
                className="flex-1 py-2.5 rounded-xl text-[12px] font-bold cursor-pointer"
                style={{ background: "#225E66", border: "1px solid rgba(34,94,102,0.5)", color: "#fff" }}>
                Libertar IP
              </button>
            </div>
          </div>
        </div>
      )}

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
