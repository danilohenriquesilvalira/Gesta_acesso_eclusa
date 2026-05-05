interface Props {
  nomeCliente: string;
  operador:    string;
  onConfirmar: () => void;
  onCancelar:  () => void;
}

export default function ConectarModal({ nomeCliente, operador, onConfirmar, onCancelar }: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
      onKeyDown={e => { if (e.key === "Escape") onCancelar(); if (e.key === "Enter") onConfirmar(); }}
      tabIndex={-1}
      autoFocus
    >
      <div className="bg-edp-card border border-edp-border rounded-xl p-7 w-full max-w-sm shadow-2xl">
        <h2 className="text-base font-bold text-white mb-1">Confirmar Ligação RDP</h2>
        <p className="text-edp-muted text-xs mb-6">
          Destino: <span className="text-white font-semibold">{nomeCliente}</span>
        </p>

        {/* Resumo */}
        <div className="flex flex-col gap-2 mb-6">
          <div className="flex items-center justify-between bg-edp-bg rounded-lg px-4 py-3">
            <span className="text-[10px] text-edp-muted uppercase tracking-wider">Operador</span>
            <span className="text-white font-semibold text-sm">{operador}</span>
          </div>
          <div className="flex items-center justify-between bg-edp-bg rounded-lg px-4 py-3">
            <span className="text-[10px] text-edp-muted uppercase tracking-wider">Destino</span>
            <span className="text-white font-semibold text-sm">{nomeCliente}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancelar}
            className="flex-1 py-2.5 rounded-lg bg-edp-bg border border-edp-border hover:border-edp-muted text-edp-muted hover:text-white font-semibold text-sm transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            className="flex-1 py-2.5 rounded-lg bg-edp-green hover:bg-green-500 text-white font-bold text-sm transition-colors cursor-pointer"
          >
            ▶  Aceder
          </button>
        </div>

        <p className="text-edp-border text-[10px] text-center mt-4">
          Enter para confirmar · ESC para cancelar
        </p>
      </div>
    </div>
  );
}
