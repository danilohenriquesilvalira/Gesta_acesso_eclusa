import type { Eclusa, Supervisao } from "../../types";

interface Props {
  nome:              string;
  eclusa:            Eclusa | undefined;
  ehAdmin:           boolean;
  backendOnline:     boolean;
  servidorAcessivel: boolean;
  sessaoAtiva:       boolean;
  emSupervisao:      boolean;
  supervisoesAtivas: Supervisao[];
  utilizadorAtual:   string;
  onSupervisao:      () => void;
  onSairSupervisao:  () => void;
}

export default function EclusaMonitorCard({
  nome, eclusa, ehAdmin, backendOnline, servidorAcessivel, sessaoAtiva, emSupervisao,
  supervisoesAtivas, utilizadorAtual, onSupervisao, onSairSupervisao,
}: Props) {
  if (nome.startsWith("IND")) {
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

  const euSuperviso  = emSupervisao;
  const outrosSuperv = supervisoesAtivas.filter(s => s.supervisor.toLowerCase() !== utilizadorAtual.toLowerCase());
  const hasAnySuperv = supervisoesAtivas.length > 0;

  const inacessivel = !servidorAcessivel;

  const isWhite = nome === "RG" || nome === "PN";

  // EDP palette: Electric Green em fundo escuro, Seaweed em fundo branco
  const accentColor = !backendOnline ? "#7C9599"
    : inacessivel  ? "#7C9599"
    : euSuperviso  ? "#263CC8"
    : hasAnySuperv ? "#E32C2C"
    : isWhite ? "#225E66" : "#28FF52";

  const statusLabel = !backendOnline ? "Sem Ligação"
    : inacessivel  ? "Inacessível"
    : euSuperviso  ? "Em Supervisão"
    : hasAnySuperv ? `Supervisão (${supervisoesAtivas.length})`
    : "Livre";

  return (
    <div
      className={`flex flex-col h-full rounded-2xl overflow-hidden ${isWhite ? "bg-white shadow-sm" : "card-dark"}`}
      style={{
        background: isWhite ? "#FFFFFF" : "#212E3E",
        border: isWhite ? "1px solid rgba(0,0,0,0.05)" : "1px solid rgba(255,255,255,0.07)",
        borderLeftWidth: 4,
        borderLeftColor: accentColor,
      }}
    >
      <div className="flex items-start justify-between px-6 pt-6 pb-4">
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isWhite ? "text-[#212E3E]/40" : "text-white/35"}`}>Supervisão</p>
          <p className={`text-[32px] font-black leading-none mt-1 ${isWhite ? "text-[#212E3E]" : "text-white"}`}>{nome}</p>
        </div>
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold mt-0.5 ${isWhite ? "bg-slate-50 border border-slate-100" : "bg-white/[0.07]"}`}
          style={{ color: accentColor }}
        >
          <span className="w-2 h-2 rounded-full" style={{ background: accentColor, animation: (euSuperviso || hasAnySuperv) ? "pulse 1.5s infinite" : "none" }} />
          {statusLabel}
        </div>
      </div>

      <div className="mx-6" style={{ height: 1, background: isWhite ? "rgba(27,47,72,0.06)" : "rgba(255,255,255,0.06)" }} />

      <div className="flex-1 px-6 py-6 flex flex-col justify-center gap-5">
        {!backendOnline ? (
          <p className={`text-[12px] font-bold text-center py-4 ${isWhite ? "text-slate-400" : "text-white/25"}`}>Sem ligação ao servidor</p>
        ) : inacessivel ? (
          <p className={`text-[12px] font-bold text-center py-4 ${isWhite ? "text-slate-400" : "text-white/25"}`}>Servidor RDP inacessível</p>
        ) : euSuperviso ? (
          <div className="flex flex-col gap-4">
            <div className={`px-4 py-3 rounded-xl ${isWhite ? "bg-blue-50 border border-blue-100" : "bg-blue-500/10 border border-blue-500/20"}`}>
              <p className={`text-[10px] font-bold uppercase tracking-wide ${isWhite ? "text-blue-600" : "text-blue-400"}`}>A supervisionar</p>
              <p className={`font-black mt-1 ${isWhite ? "text-[18px] text-[#212E3E]" : "text-[13px] text-white"}`}>{utilizadorAtual}</p>
            </div>
            {outrosSuperv.length > 0 && (
              <div className={`px-4 py-3 rounded-xl ${isWhite ? "bg-slate-50 border border-slate-100" : "bg-white/[0.05] border border-white/10"}`}>
                <p className={`text-[10px] font-bold uppercase tracking-wide mb-2 ${isWhite ? "text-slate-500" : "text-white/40"}`}>Também a supervisionar</p>
                {outrosSuperv.map((s, i) => (
                  <p key={i} className={`font-semibold text-[12px] ${isWhite ? "text-[#212E3E]" : "text-white/80"}`}>• {s.supervisor}</p>
                ))}
              </div>
            )}
          </div>
        ) : hasAnySuperv ? (
          <div className={`px-4 py-4 rounded-xl ${isWhite ? "bg-red-50 border border-red-100" : "bg-red-500/10 border border-red-500/20"}`}>
            <p className={`text-[10px] font-bold uppercase tracking-wide mb-2 ${isWhite ? "text-red-600" : "text-red-400"}`}>Supervisão Ativa</p>
            {supervisoesAtivas.map((s, i) => (
              <p key={i} className={`font-semibold text-[12px] ${isWhite ? "text-[#212E3E]" : "text-white/80"}`}>• {s.supervisor}</p>
            ))}
          </div>
        ) : eclusa ? (
          <div className="flex flex-col gap-4">
            {eclusa.modo && (
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-xl ${isWhite ? "bg-slate-50" : "bg-white/[0.05]"}`}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={isWhite ? "text-[#212E3E]" : "text-white/40"}>
                    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </div>
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-[0.15em] ${isWhite ? "text-[#212E3E]/40" : "text-white/35"}`}>Modo Atual</p>
                  <p className={`font-black font-mono ${isWhite ? "text-[18px] text-[#212E3E]" : "text-[14px] text-white"}`}>{eclusa.modo}</p>
                </div>
              </div>
            )}
            {eclusa.posto && (
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-xl ${isWhite ? "bg-slate-50" : "bg-white/[0.05]"}`}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={isWhite ? "text-[#212E3E]" : "text-white/40"}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-[0.15em] ${isWhite ? "text-[#212E3E]/40" : "text-white/35"}`}>Posto Local</p>
                  <p className={`font-black ${isWhite ? "text-[16px] text-[#212E3E]" : "text-[13px] text-white"}`}>{eclusa.posto}</p>
                </div>
              </div>
            )}
            {eclusa.usuario && (
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-xl ${isWhite ? "bg-slate-50" : "bg-white/[0.05]"}`}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={isWhite ? "text-[#212E3E]" : "text-white/40"}>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-[0.15em] ${isWhite ? "text-[#212E3E]/40" : "text-white/35"}`}>Operador WinCC</p>
                  <p className={`font-black ${isWhite ? "text-[16px] text-[#212E3E]" : "text-[13px] text-white"}`}>{eclusa.usuario}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className={`text-[12px] font-bold text-center py-4 ${isWhite ? "text-slate-300" : "text-white/20"}`}>Aguardando telemetria...</p>
        )}
      </div>

      <div style={{ height: 1, background: isWhite ? "rgba(27,47,72,0.06)" : "rgba(255,255,255,0.06)", margin: "0 24px" }} />

      <div className="px-4 py-3">
        {!backendOnline || inacessivel ? (
          <div style={{ height: 38 }} />
        ) : ehAdmin && sessaoAtiva ? (
          euSuperviso ? (
            <button
              onClick={onSairSupervisao}
              className="w-full py-2.5 rounded-xl font-bold text-[12px] text-white transition-all cursor-pointer"
              style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(59,130,246,0.25)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(59,130,246,0.15)"; }}
            >
              Sair de Supervisão
            </button>
          ) : (
            <button
              onClick={onSupervisao}
              className="w-full py-2.5 rounded-xl font-bold text-[12px] transition-all cursor-pointer shadow-sm"
              style={{
                background: isWhite ? "#212E3E" : "rgba(255,255,255,0.05)",
                border: isWhite ? "none" : "1px solid rgba(255,255,255,0.15)",
                color: isWhite ? "#FFFFFF" : "rgba(255,255,255,0.7)",
              }}
              onMouseEnter={e => {
                if (isWhite) { (e.currentTarget as HTMLButtonElement).style.background = "#253e5d"; }
                else { (e.currentTarget as HTMLButtonElement).style.background = "rgba(59,130,246,0.1)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(59,130,246,0.2)"; (e.currentTarget as HTMLButtonElement).style.color = "#263CC8"; }
              }}
              onMouseLeave={e => {
                if (isWhite) { (e.currentTarget as HTMLButtonElement).style.background = "#212E3E"; }
                else { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.15)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.7)"; }
              }}
            >
              Iniciar Supervisão
            </button>
          )
        ) : (
          <div style={{ height: 38 }} />
        )}
      </div>
    </div>
  );
}
