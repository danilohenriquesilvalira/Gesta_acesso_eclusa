interface Props {
  apiUrl: string;
  apiOk:  boolean | null;
}

export default function StatusBar({ apiUrl, apiOk }: Props) {
  const dot   = apiOk === null ? "bg-yellow-400 animate-pulse" : apiOk ? "bg-edp-green" : "bg-edp-red animate-pulse";
  const label = apiOk === null ? "A ligar..."  : apiOk ? "API Ligada" : "Sem ligação à API";
  const cor   = apiOk === null ? "text-yellow-400" : apiOk ? "text-edp-green" : "text-edp-red";

  return (
    <footer className="shrink-0 border-t border-white/8 px-6 py-2 flex items-center justify-between" style={{ background: "#212E3E" }}>
      <span className="text-[10px] text-white/20 font-mono">{apiUrl}</span>
      <div className="flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <span className={`text-[10px] font-bold ${cor}`}>{label}</span>
      </div>
      <span className="text-[10px] text-white/15 font-mono">SSE · Poll 15s · WinCC API</span>
    </footer>
  );
}
