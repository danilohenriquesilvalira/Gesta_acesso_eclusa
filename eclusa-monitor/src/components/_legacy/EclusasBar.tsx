import type { Eclusa } from "../App";

interface Props {
  eclusas: { CL: Eclusa; CM: Eclusa; PN: Eclusa; RG: Eclusa; VR: Eclusa };
  timestamp: string;
}

const NOMES: Record<string, string> = {
  RG: "Régua", PN: "Pocinho", CL: "Crestuma", CM: "Carrapatelo", VR: "Valeira",
};

const ORDEM = ["RG", "PN", "CL", "CM", "VR"] as const;

function CardEclusa({ cod, e }: { cod: string; e: Eclusa }) {
  const livre = e.status === 0;
  const supervisao = e.status === 2;

  const dotCor = livre ? "bg-edp-muted" : supervisao ? "bg-blue-400 animate-pulse" : "bg-edp-red animate-pulse";
  const textCor = livre ? "text-edp-muted" : supervisao ? "text-blue-400" : "text-edp-red";
  const borderCor = livre ? "border-edp-border" : supervisao ? "border-blue-500/30" : "border-edp-red/30";

  return (
    <div className={`flex-1 border rounded-lg px-4 py-2.5 bg-edp-card ${borderCor}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full shrink-0 ${dotCor}`} />
          <span className="text-white font-bold text-sm">{NOMES[cod] ?? cod}</span>
          <span className="text-edp-muted text-[10px] font-mono">({cod})</span>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-widest ${textCor}`}>
          {e.modo}
        </span>
      </div>

      {!livre && (
        <div className="flex items-center gap-2 mt-1">
          {e.posto && (
            <span className="text-[10px] bg-edp-bg border border-edp-border text-edp-muted px-2 py-0.5 rounded font-mono">
              {e.posto}
            </span>
          )}
          {e.usuario && (
            <span className="text-[10px] text-white font-semibold">{e.usuario}</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function EclusasBar({ eclusas, timestamp }: Props) {
  return (
    <div className="shrink-0 border-t border-edp-border bg-edp-card px-6 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-edp-muted text-[10px] uppercase tracking-widest font-semibold">
          Estado WinCC — Eclusas
        </span>
        {timestamp && (
          <span className="text-edp-border text-[10px] font-mono ml-1">{timestamp}</span>
        )}
      </div>
      <div className="flex gap-3">
        {ORDEM.map(cod => (
          <CardEclusa key={cod} cod={cod} e={eclusas[cod]} />
        ))}
      </div>
    </div>
  );
}
