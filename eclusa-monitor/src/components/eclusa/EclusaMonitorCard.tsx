import type { Eclusa } from "../../App";

interface Props {
  nome:   string;
  eclusa: Eclusa | undefined;
}

export default function EclusaMonitorCard({ nome, eclusa }: Props) {
  const isIndisponivel = nome.startsWith("IND");

  if (isIndisponivel) {
    return (
      <div 
        className="flex flex-col items-center justify-center bg-[#323232] rounded-[32px] border border-white/5 h-full p-8 transition-all duration-500 hover:scale-[1.02]"
        style={{ 
          boxShadow: "0 20px 40px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.05)" 
        }}
      >
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
          <svg width="200" height="124" viewBox="0 0 220 137" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-90">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M60.4312 79.4753C59.572 84.6706 53.0764 96.1566 36.9471 96.1566C15.3978 96.1566 10.8302 73.5586 11.3652 69.5853L67.9836 69.5642C67.2043 50.9118 54.0443 36.0555 35.1767 36.0555C15.7496 36.0555 0 51.8063 0 71.2346C0 90.6639 15.7496 106.414 35.1767 106.414C51.7666 106.414 64.6036 94.9291 68.0013 79.4753H60.4312ZM33.3552 43.2325C45.1144 43.2325 53.6158 50.3813 56.6361 61.935L12.0068 61.8739C14.8905 48.8719 25.1324 43.2325 33.3552 43.2325ZM184.812 36.0129C165.379 36.0129 149.624 51.7675 149.624 71.2035V136.847H160.907V96.8636C166.515 103.042 175.599 106.393 184.812 106.393C204.246 106.393 220 90.6373 220 71.2035C220 51.7675 204.246 36.0129 184.812 36.0129ZM187.41 98.3719C172.603 98.292 161.243 85.6861 161.152 68.6164C161.056 50.6943 173.899 43.186 182.502 43.2325C197.261 43.3126 209.007 57.2414 209.093 73.5875C209.174 88.7926 198.634 98.4329 187.41 98.3719ZM132.265 0V45.5989C126.486 39.2705 117.573 36.0128 108.361 36.0128C88.928 36.0128 73.1739 51.7675 73.1739 71.2035C73.1739 90.6373 88.928 106.393 108.361 106.393C127.794 106.393 143.548 90.6373 143.548 71.2035V0H132.265ZM110.563 98.3763C95.7888 98.2964 84.1705 84.8093 84.0795 68.2224C83.9852 52.1138 95.2693 43.191 105.654 43.2371C120.446 43.3173 131.936 56.3635 132.022 73.1935C132.103 90.2122 120.004 98.4374 110.563 98.3763Z" fill="#ffffff"/>
          </svg>
          <p className="text-[36px] font-black uppercase tracking-[0.2em] text-[#ffffff] leading-tight">Indisponível</p>
        </div>
      </div>
    );
  }

  const emOperacao = eclusa?.status === 1;

  const accentColor = emOperacao ? "#f97316" : "#00A651";
  const badgeBg     = emOperacao ? "#fff7ed" : "#f0fdf4";
  const badgeFg     = emOperacao ? "#9a3412" : "#15803d";
  const badgeLabel  = emOperacao ? "Em Operação" : "Livre";

  return (
    <div
      className="flex flex-col bg-white rounded-[32px] overflow-hidden transition-all duration-300 h-full"
      style={{
        boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
        border: "1px solid #e5e9f0",
        borderLeftWidth: "6px",
        borderLeftColor: accentColor,
      }}
    >
      {/* Topo */}
      <div className="flex items-start justify-between px-5 pt-5 pb-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#94a3b8" }}>Monitoramento</p>
          <p className="text-4xl font-extrabold leading-none mt-1" style={{ color: "#0f172a" }}>{nome}</p>
          <p className="text-[12px] font-semibold mt-1.5" style={{ color: "#64748b" }}>Eclusa {nome}</p>
          <p className="text-[11px] mt-0.5" style={{ color: "#94a3b8" }}>Estado WinCC</p>
        </div>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-[12px] mt-0.5"
          style={{ background: badgeBg, color: badgeFg }}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{
              background: accentColor,
              animation: emOperacao ? "pulse 1.5s infinite" : "none",
            }}
          />
          {badgeLabel}
        </div>
      </div>

      {/* Divisor */}
      <div className="mx-5" style={{ height: 1, background: "#f1f5f9" }} />

      {/* Detalhes */}
      <div className="flex-1 px-5 py-4 flex flex-col justify-center gap-3">
        {eclusa ? (
          <>
            {eclusa.modo && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#94a3b8" }}>Modo</p>
                <p className="text-[16px] font-extrabold font-mono mt-0.5" style={{ color: "#0f172a" }}>{eclusa.modo}</p>
              </div>
            )}
            {eclusa.posto && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#94a3b8" }}>Posto</p>
                <p className="text-[15px] font-bold mt-0.5" style={{ color: "#0f172a" }}>{eclusa.posto}</p>
              </div>
            )}
            {eclusa.usuario && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#94a3b8" }}>Operador WinCC</p>
                <p className="text-[15px] font-bold mt-0.5" style={{ color: "#f97316" }}>{eclusa.usuario}</p>
              </div>
            )}
            {!eclusa.modo && !eclusa.posto && !eclusa.usuario && (
              <p className="text-[13px] font-semibold" style={{ color: "#cbd5e1" }}>Sem dados WinCC</p>
            )}
          </>
        ) : (
          <p className="text-[13px] font-semibold" style={{ color: "#cbd5e1" }}>Aguardando dados...</p>
        )}
      </div>

      {/* Barra inferior colorida */}
      <div style={{ height: 4, background: accentColor, opacity: 0.35 }} />
    </div>
  );
}
