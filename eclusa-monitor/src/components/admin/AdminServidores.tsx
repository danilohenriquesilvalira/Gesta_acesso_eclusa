import { memo, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RdpInfo, ServidorHealth } from "../../types";

// ── Configuração estática dos servidores e clientes ──────────────────────────

const SERVIDORES_WINCC = [
  { id: "RG",  ip: "172.29.164.13", eclusa: "Régua" },
  { id: "PN",  ip: "172.29.164.14", eclusa: "Pocinho" },
  { id: "CL",  ip: "172.29.164.18", eclusa: "Crestuma-Lever" },
  { id: "CM",  ip: "172.29.164.19", eclusa: "Caniçada-Moure" },
  { id: "VR",  ip: "172.29.164.20", eclusa: "Venda Nova-Rabagão" },
];

const SERVIDORES_RESERVA = [
  { id: "Reserva01", ip: "172.29.164.15" },
  { id: "Reserva02", ip: "172.29.164.16" },
  { id: "Reserva03", ip: "172.29.164.17" },
];


// Mapa servidor id → ClienteKey para mostrar quem está logado
const SERVIDOR_CLIENTE: Record<string, "eclusa_RG" | "eclusa_PN"> = {
  RG: "eclusa_RG",
  PN: "eclusa_PN",
};

// ── Indicador visual ─────────────────────────────────────────────────────────

function Dot({ vivo, label }: { vivo: boolean | undefined; label: string }) {
  const cor   = vivo === undefined ? "#4B5563" : vivo ? "#28FF52" : "#E32C2C";
  const texto = vivo === undefined ? "---"      : vivo ? "ONLINE"  : "OFFLINE";
  return (
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cor }} />
      <span className="text-[11px] font-bold" style={{ color: cor }}>{texto}</span>
      <span className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</span>
    </div>
  );
}

// ── Botão RDP Admin ───────────────────────────────────────────────────────────

function BotaoRdpAdmin({ ip, token, disabled = false }: { ip: string; token: string; disabled?: boolean }) {
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (loading || disabled) return;
    setLoading(true);
    try {
      const err = await invoke<string>("connect_rdp_admin", { ip, token });
      if (err) console.error("RDP admin:", err);
    } catch (e) {
      console.error("RDP admin invoke:", e);
    } finally {
      setTimeout(() => setLoading(false), 2000);
    }
  }, [ip, token, disabled, loading]);

  return (
    <button
      onClick={handleClick}
      disabled={disabled || loading}
      title={disabled ? "Servidor offline" : `Abrir RDP para ${ip}`}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
      style={{
        background: disabled ? "rgba(255,255,255,0.04)" : loading ? "rgba(12,211,248,0.15)" : "rgba(12,211,248,0.12)",
        border:     disabled ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(12,211,248,0.3)",
        color:      disabled ? "rgba(255,255,255,0.2)" : "#0CD3F8",
        cursor:     disabled ? "not-allowed" : "pointer",
      }}
    >
      {/* Monitor icon */}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <line x1="8" y1="21" x2="16" y2="21"/>
        <line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
      {loading ? "A abrir..." : "RDP"}
    </button>
  );
}

// ── Linha de servidor ─────────────────────────────────────────────────────────

function LinhaServidor({
  ip, nome, eclusa, health, mostrarWincc, sessaoAtiva, rdpSempreHabilitado, token,
}: {
  ip:                  string;
  nome:                string;
  eclusa?:             string;
  health?:             ServidorHealth;
  mostrarWincc:        boolean;
  sessaoAtiva?:        { utilizador: string } | null;
  rdpSempreHabilitado?: boolean;
  token:               string;
}) {
  const online = health?.windows_vivo;
  const borda  = online ? "rgba(40,255,82,0.15)" : "rgba(227,44,44,0.12)";

  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-xl mb-2"
      style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${borda}` }}>

      {/* IP — identificador primário */}
      <div className="shrink-0" style={{ width: 140 }}>
        <span className="font-mono font-bold text-[13px] text-white">{ip}</span>
      </div>

      {/* Nome / Eclusa */}
      <div className="shrink-0" style={{ width: 160 }}>
        <span className="font-bold text-[12px] text-white/80">{nome}</span>
        {eclusa && (
          <span className="block text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.3)" }}>
            {eclusa}
          </span>
        )}
      </div>

      {/* Windows */}
      <div className="flex-1">
        <Dot vivo={health?.windows_vivo} label="Windows Server" />
      </div>

      {/* WinCC — só para servidores de produção */}
      <div className="flex-1">
        {mostrarWincc
          ? <Dot vivo={health?.windows_vivo ? health?.wincc_vivo : false} label="WinCC" />
          : <span className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.2)" }}>— sem WinCC —</span>
        }
      </div>

      {/* Sessão activa */}
      <div className="shrink-0" style={{ width: 140 }}>
        {sessaoAtiva ? (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "#F7D200" }} />
            <span className="text-[10px] font-bold truncate" style={{ color: "#F7D200" }}>
              {sessaoAtiva.utilizador || "Em uso"}
            </span>
          </div>
        ) : online ? (
          <span className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.2)" }}>livre</span>
        ) : null}
      </div>

      {/* Último heartbeat */}
      <div className="shrink-0 text-right" style={{ width: 100 }}>
        {health?.ultimo_heartbeat
          ? <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
              {health.ultimo_heartbeat.slice(11, 19)}
            </span>
          : <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.15)" }}>sem sinal</span>
        }
      </div>

      {/* Botão RDP Admin — sempre habilitado para admin diagnosticar mesmo com agente morto */}
      <div className="shrink-0" style={{ width: 90 }}>
        <BotaoRdpAdmin ip={ip} token={token} disabled={rdpSempreHabilitado ? false : !online} />
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

interface Props {
  servidorHealth: Record<string, ServidorHealth>;
  rdp?:           { eclusa_RG: RdpInfo; eclusa_PN: RdpInfo };
  sessoes?:       Record<string, unknown>;
  token:          string;
}

function AdminServidores({ servidorHealth, rdp, token }: Props) {
  const vivosWincc    = SERVIDORES_WINCC.filter(s => servidorHealth[s.id]?.windows_vivo).length;
  const winccVivos    = SERVIDORES_WINCC.filter(s => servidorHealth[s.id]?.wincc_vivo).length;
  const vivosReserva  = SERVIDORES_RESERVA.filter(s => servidorHealth[s.id]?.windows_vivo && servidorHealth[s.id]?.wincc_vivo).length;

  // Sessão activa por servidor (só para RG e PN — monitorizados pelo rdp_poll)
  function sessaoDoServidor(id: string): { utilizador: string } | null {
    const key = SERVIDOR_CLIENTE[id];
    if (!key || !rdp) return null;
    const info = (rdp as Record<string, RdpInfo>)[key];
    if (!info?.ocupado) return null;
    return { utilizador: info.utilizador };
  }

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ background: "#212E3E" }}>

      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-white font-black text-xl mb-1">Visão Geral dos Servidores</h1>
        <p className="text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>
          Estado em tempo real — Windows Server + WinCC + Servidores Reserva
        </p>
      </div>

      {/* ── Resumo ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Servidores WinCC Online", valor: `${vivosWincc} / ${SERVIDORES_WINCC.length}`,       cor: vivosWincc    === SERVIDORES_WINCC.length    ? "#28FF52" : "#F7D200" },
          { label: "WinCC Processos Vivos",   valor: `${winccVivos} / ${SERVIDORES_WINCC.length}`,       cor: winccVivos    === SERVIDORES_WINCC.length    ? "#28FF52" : "#F7D200" },
          { label: "Reservas Prontas",        valor: `${vivosReserva} / ${SERVIDORES_RESERVA.length}`,   cor: vivosReserva > 0 ? "#28FF52" : "#E32C2C" },
        ].map(({ label, valor, cor }) => (
          <div key={label} className="px-4 py-3 rounded-xl" style={{ background: "#212E3E", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-[10px] font-extrabold uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</p>
            <p className="text-2xl font-black" style={{ color: cor }}>{valor}</p>
          </div>
        ))}
      </div>

      {/* ── Cabeçalho da tabela ───────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 py-2 mb-1">
        <div className="shrink-0 text-[9px] font-extrabold uppercase tracking-widest" style={{ width: 140, color: "rgba(255,255,255,0.25)" }}>IP</div>
        <div className="shrink-0 text-[9px] font-extrabold uppercase tracking-widest" style={{ width: 160, color: "rgba(255,255,255,0.25)" }}>Servidor</div>
        <div className="flex-1  text-[9px] font-extrabold uppercase tracking-widest"  style={{ color: "rgba(255,255,255,0.25)" }}>Windows</div>
        <div className="flex-1  text-[9px] font-extrabold uppercase tracking-widest"  style={{ color: "rgba(255,255,255,0.25)" }}>WinCC</div>
        <div className="shrink-0 text-[9px] font-extrabold uppercase tracking-widest" style={{ width: 140, color: "rgba(255,255,255,0.25)" }}>Sessão Activa</div>
        <div className="shrink-0 text-[9px] font-extrabold uppercase tracking-widest text-right" style={{ width: 100, color: "rgba(255,255,255,0.25)" }}>Último Sinal</div>
        <div className="shrink-0 text-[9px] font-extrabold uppercase tracking-widest" style={{ width: 90, color: "rgba(255,255,255,0.25)" }}>Acesso</div>
      </div>

      {/* ── Servidores WinCC (produção) ───────────────────────────────────── */}
      <p className="text-[9px] font-extrabold uppercase tracking-[0.2em] mb-2 mt-4 px-1"
        style={{ color: "rgba(255,255,255,0.25)" }}>
        Servidores WinCC — Produção
      </p>
      {SERVIDORES_WINCC.map(s => (
        <LinhaServidor key={s.id}
          ip={s.ip} nome={s.id} eclusa={s.eclusa}
          health={servidorHealth[s.id]}
          mostrarWincc={true}
          sessaoAtiva={sessaoDoServidor(s.id)}
          rdpSempreHabilitado={true}
          token={token}
        />
      ))}

      {/* ── Servidores Reserva ────────────────────────────────────────────── */}
      <p className="text-[9px] font-extrabold uppercase tracking-[0.2em] mb-2 mt-6 px-1"
        style={{ color: "rgba(255,255,255,0.25)" }}>
        Servidores Reserva
      </p>
      {SERVIDORES_RESERVA.map(s => (
        <LinhaServidor key={s.id}
          ip={s.ip} nome={s.id}
          health={servidorHealth[s.id]}
          mostrarWincc={true}
          sessaoAtiva={null}
          rdpSempreHabilitado={true}
          token={token}
        />
      ))}

    </div>
  );
}

export default memo(AdminServidores);
