import { useState, useEffect, useMemo } from "react";
import type { Sessao, RdpInfo } from "../../types";

interface Props {
  nomeEclusa:      string;
  nomeCliente:     string;
  sessao:          Sessao;
  rdp:             RdpInfo;
  conectando:      boolean;
  ehAdmin:         boolean;
  backendOnline:   boolean;
  emReserva?:      string; // ID do reserva em uso ex: "Reserva01"
  onConectar:      () => void;
  onEncerrar:      () => void;
  onForcarEncerrar?: () => void;
  utilizadorAtual: string;
}

function formatDur(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [h, m, ss].map(v => String(v).padStart(2, "0")).join(":");
}

export default function EclusaAcessoCard({
  nomeEclusa, sessao, rdp,
  conectando, ehAdmin, backendOnline, emReserva, onConectar, onEncerrar, onForcarEncerrar, utilizadorAtual,
}: Props) {
  // Clock local — só corre quando há sessão activa, não polui o App inteiro
  const [agora, setAgora] = useState(new Date());
  useEffect(() => {
    if (!rdp.ocupado) return;
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, [rdp.ocupado]);
  if (nomeEclusa.startsWith("IND")) {
    return (
      <div
        className="flex flex-col items-center justify-center bg-[#323232] rounded-[32px] border border-white/5 h-full p-8"
        style={{ boxShadow: "0 20px 40px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.05)" }}
      >
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
          <svg width="200" height="124" viewBox="0 0 220 137" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-90">
            <path fillRule="evenodd" clipRule="evenodd" d="M60.4312 79.4753C59.572 84.6706 53.0764 96.1566 36.9471 96.1566C15.3978 96.1566 10.8302 73.5586 11.3652 69.5853L67.9836 69.5642C67.2043 50.9118 54.0443 36.0555 35.1767 36.0555C15.7496 36.0555 0 51.8063 0 71.2346C0 90.6639 15.7496 106.414 35.1767 106.414C51.7666 106.414 64.6036 94.9291 68.0013 79.4753H60.4312ZM33.3552 43.2325C45.1144 43.2325 53.6158 50.3813 56.6361 61.935L12.0068 61.8739C14.8905 48.8719 25.1324 43.2325 33.3552 43.2325ZM184.812 36.0129C165.379 36.0129 149.624 51.7675 149.624 71.2035V136.847H160.907V96.8636C166.515 103.042 175.599 106.393 184.812 106.393C204.246 106.393 220 90.6373 220 71.2035C220 51.7675 204.246 36.0129 184.812 36.0129ZM187.41 98.3719C172.603 98.292 161.243 85.6861 161.152 68.6164C161.056 50.6943 173.899 43.186 182.502 43.2325C197.261 43.3126 209.007 57.2414 209.093 73.5875C209.174 88.7926 198.634 98.4329 187.41 98.3719ZM132.265 0V45.5989C126.486 39.2705 117.573 36.0128 108.361 36.0128C88.928 36.0128 73.1739 51.7675 73.1739 71.2035C73.1739 90.6373 88.928 106.393 108.361 106.393C127.794 106.393 143.548 90.6373 143.548 71.2035V0H132.265ZM110.563 98.3763C95.7888 98.2964 84.1705 84.8093 84.0795 68.2224C83.9852 52.1138 95.2693 43.191 105.654 43.2371C120.446 43.3173 131.936 56.3635 132.022 73.1935C132.103 90.2122 120.004 98.4374 110.563 98.3763Z" fill="#ffffff" />
          </svg>
          <p className="text-[36px] font-black uppercase tracking-[0.2em] text-white leading-tight">Indisponível</p>
        </div>
      </div>
    );
  }

  // Em failover o servidor principal está offline — usa sessao como fonte de verdade
  const emFailover  = !!emReserva;
  const inacessivel = !emFailover && !rdp.verificado;
  const ocupado     = emFailover ? sessao.conectado : rdp.ocupado;
  const livre       = !inacessivel && !ocupado && !rdp.nao_autorizado;
  const naoAutor    = !inacessivel && !emFailover && rdp.nao_autorizado;
  const operador    = sessao.operador || (rdp.ocupado ? rdp.utilizador : "") || "";
  const ehMinha     = sessao.conectado && sessao.operador.toLowerCase() === utilizadorAtual.toLowerCase();

  const isWhite = nomeEclusa === "RG" || nomeEclusa === "PN";

  const accentColor = !backendOnline ? "#7C9599"
    : inacessivel ? "#7C9599"
    : naoAutor ? "#F7D200"
    : ocupado ? "#E32C2C"
    : isWhite ? "#225E66" : "#28FF52";
  const statusLabel = !backendOnline ? "Sem Ligação"
    : inacessivel ? "Inacessível"
    : naoAutor ? "Não Autorizado"
    : ocupado ? "Em Uso"
    : "Disponível";

  const tempo = useMemo(() => {
    if (!sessao.conectado || !sessao.timestamp_inicio) return null;
    const d = new Date(sessao.timestamp_inicio.replace(" ", "T") + "Z");
    if (isNaN(d.getTime())) return null;
    return formatDur(Math.max(0, Math.floor((agora.getTime() - d.getTime()) / 1000)));
  }, [sessao.timestamp_inicio, sessao.conectado, agora]);

  return (
    <div
      className={`flex flex-col h-full rounded-2xl overflow-hidden ${isWhite ? "bg-white shadow-sm" : "card-dark"}`}
      style={{ 
        background: isWhite ? "#FFFFFF" : "#212E3E", 
        border: isWhite ? "1px solid rgba(0,0,0,0.05)" : "1px solid rgba(255,255,255,0.07)", 
        borderLeftWidth: 4, 
        borderLeftColor: accentColor 
      }}
    >
      {/* Cabeçalho */}
      <div className="flex items-start justify-between px-6 pt-6 pb-4">
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isWhite ? "text-[#212E3E]/40" : "text-white/40"}`}>Controle de Acesso</p>
          <p className={`text-[32px] font-black leading-none mt-1 ${isWhite ? "text-[#212E3E]" : "text-white"}`}>{nomeEclusa}</p>
          {emReserva && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span className="text-[10px] font-bold" style={{ color: "#F59E0B" }}>Via {emReserva}</span>
            </div>
          )}
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold mt-0.5 ${isWhite ? "bg-slate-50 border border-slate-100" : "bg-white/[0.07]"}`}
          style={{ color: accentColor }}>
          <span className="w-2 h-2 rounded-full" style={{ background: accentColor, animation: !livre ? "pulse 1.5s infinite" : "none" }} />
          {statusLabel}
        </div>
      </div>

      <div className="mx-4" style={{ height: 1, background: isWhite ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.06)" }} />

      {/* Corpo */}
      <div className="flex-1 px-6 py-6 flex flex-col justify-center gap-6">
        <div className="flex items-center gap-4 group">
          <div className={`p-3 rounded-2xl transition-all ${isWhite ? "bg-slate-50 group-hover:bg-slate-100" : "bg-white/[0.05]"}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={isWhite ? "text-[#212E3E]" : "text-white/40"}>
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div>
            <p className={`text-[11px] font-bold uppercase tracking-[0.15em] ${isWhite ? "text-[#212E3E]/40" : "text-white/40"}`}>Operador Atual</p>
            <p className={`font-black leading-tight ${isWhite ? "text-[20px] text-[#212E3E]" : "text-[15px] text-white"}`}>{operador || (inacessivel ? "—" : "SISTEMA LIVRE")}</p>
          </div>
        </div>

        <div className={`h-px w-full ${isWhite ? "bg-slate-100" : "bg-white/5"}`} />

        {tempo && (
          <div className="flex items-center gap-4 group">
            <div className={`p-3 rounded-2xl transition-all ${isWhite ? "bg-slate-50 group-hover:bg-slate-100" : "bg-white/[0.05]"}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={isWhite ? "text-[#212E3E]" : "text-white/40"}>
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div>
              <p className={`text-[11px] font-bold uppercase tracking-[0.15em] ${isWhite ? "text-[#212E3E]/40" : "text-white/40"}`}>Tempo de Sessão</p>
              <p className={`font-black font-mono tabular-nums leading-tight ${isWhite ? "text-[28px] text-[#212E3E]" : "text-[20px] text-white"}`}>{tempo}</p>
            </div>
          </div>
        )}

        {naoAutor && (
          <div className={`px-4 py-3 rounded-xl ${isWhite ? "bg-red-50 border border-red-100" : "bg-amber-500/10 border border-amber-500/25"}`}>
            <p className={`text-[10px] font-bold uppercase tracking-wide ${isWhite ? "text-red-700" : "text-amber-600"}`}>Acesso Não Autorizado</p>
            {rdp.utilizador && <p className={`text-[12px] font-bold mt-0.5 ${isWhite ? "text-red-900" : "text-amber-400/70"}`}>{rdp.utilizador}</p>}
          </div>
        )}
      </div>

      <div className="mx-4" style={{ height: 1, background: isWhite ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.06)" }} />

      {/* Botões */}
      <div className="px-4 py-3">
        {!backendOnline ? (
          <div className="py-2.5 rounded-xl text-center text-[12px] font-bold text-slate-400/60 bg-slate-400/[0.08]">
            Backend indisponível
          </div>
        ) : inacessivel ? (
          <div className="py-2.5 rounded-xl text-center text-[12px] font-bold text-slate-400/60 bg-slate-400/[0.08]">
            Servidor inacessível
          </div>
        ) : livre ? (
            <button
              onClick={onConectar}
              disabled={conectando}
              className="w-full py-2.5 rounded-xl font-bold text-[13px] text-white transition-all cursor-pointer disabled:opacity-40 shadow-sm"
              style={{ background: conectando ? "rgba(27,47,72,0.1)" : isWhite ? "#212E3E" : "#00A651" }}
            >
              {conectando ? "A ligar..." : "Aceder via RDP"}
            </button>
        ) : naoAutor ? (
          <div className="py-2.5 rounded-xl text-center text-[12px] font-bold text-amber-400/60 bg-amber-400/[0.08]">
            Aguardar saída do utilizador
          </div>
        ) : ocupado ? (
          <div className="flex flex-col gap-2">
            <div className={`py-2 rounded-xl text-center text-[11px] font-bold ${isWhite ? "text-white bg-[#991B1B]" : "text-white/30 bg-white/[0.05]"}`}>
              Sessão em Uso
            </div>
            {/* Terminar a minha própria sessão (qualquer utilizador) */}
            {ehMinha && (
              <button
                onClick={onEncerrar}
                className={`w-full py-2 rounded-xl font-bold text-[12px] transition-all cursor-pointer ${isWhite ? "text-slate-500 bg-slate-50" : "text-white/50 bg-white/[0.05]"}`}
                style={{ border: isWhite ? "1px solid rgba(0,0,0,0.05)" : "1px solid rgba(255,255,255,0.1)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#E32C2C"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(227,6,19,0.4)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = isWhite ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.5)"; (e.currentTarget as HTMLButtonElement).style.borderColor = isWhite ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.1)"; }}
              >
                Terminar Sessão
              </button>
            )}
            {/* Admin pode forçar qualquer sessão — própria ou alheia — enquanto RDP estiver ocupado */}
            {ehAdmin && onForcarEncerrar && (
              <button
                onClick={onForcarEncerrar}
                className="w-full py-2 rounded-xl font-bold text-[12px] text-white transition-all cursor-pointer"
                style={{ background: ehMinha ? "rgba(227,44,44,0.7)" : "#E32C2C" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#b91c1c"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ehMinha ? "rgba(227,44,44,0.7)" : "#E32C2C"; }}
              >
                {ehMinha ? "Forçar Encerramento" : "Forçar Desconexão"}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
