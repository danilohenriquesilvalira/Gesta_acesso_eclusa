import { useMemo } from "react";
import type { Sessao, RdpInfo, Eclusa } from "../App";

interface Props {
  nome:       string;
  ip:         string;
  sessao:     Sessao;
  rdp:        RdpInfo;
  bloqueio:   { bloqueado: boolean; razao: string };
  eclusas:    { PN: Eclusa; RG: Eclusa; [k: string]: Eclusa } | undefined;
  agora:      Date;
  conectando: boolean;
  onConectar: () => void;
  onEncerrar: () => void;
}

function formatDur(s: number) {
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [h, m, ss].map(v => String(v).padStart(2, "0")).join(":");
}

function StatusEclusa({ e }: { e: Eclusa | undefined }) {
  if (!e) return <span className="text-edp-muted text-sm font-mono">—</span>;
  const operacao = e.status === 1;
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full shrink-0 ${operacao ? "bg-orange-400 animate-pulse" : "bg-edp-muted"}`} />
      <span className={`text-sm font-semibold font-mono ${operacao ? "text-orange-400" : "text-edp-muted"}`}>
        {operacao ? `OPERAÇÃO${e.usuario ? ` · ${e.usuario}` : ""}` : "LIVRE"}
      </span>
    </div>
  );
}

export default function ClientePanel({ nome, ip, sessao, rdp, bloqueio, eclusas, agora, conectando, onConectar, onEncerrar }: Props) {
  const livre = !bloqueio.bloqueado;
  const operador = sessao.operador || (rdp.ocupado ? "—" : "");

  const tempo = useMemo(() => {
    if (livre || !sessao.timestamp_inicio) return null;
    const inicio = new Date(sessao.timestamp_inicio.replace(" ", "T"));
    if (isNaN(inicio.getTime())) return null;
    return formatDur(Math.max(0, Math.floor((agora.getTime() - inicio.getTime()) / 1000)));
  }, [sessao.timestamp_inicio, agora, livre]);

  // Sessão RDP activa mas não registada pela app = acesso não autorizado
  const naoAutorizado = rdp.nao_autorizado;

  return (
    <div className={`flex-1 flex flex-col rounded-xl border bg-edp-card overflow-hidden transition-all duration-300
      ${naoAutorizado ? "border-yellow-500/60" : livre ? "border-edp-border" : "border-edp-red/50"}`}
    >
      {/* Cabeçalho */}
      <div className={`px-5 py-4 flex items-center justify-between border-b
        ${naoAutorizado ? "border-yellow-500/30 bg-yellow-500/5"
          : livre ? "border-edp-border" : "border-edp-red/30 bg-edp-red/5"}`}
      >
        <div>
          <h2 className="text-sm font-bold text-white tracking-wide">{nome}</h2>
          <p className="text-[11px] text-edp-muted font-mono mt-0.5">{ip}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border
            ${rdp.verificado ? "border-edp-border text-edp-border" : "border-yellow-800/40 text-yellow-700"}`}
          >
            {rdp.verificado ? "RDP ✓" : "RDP ?"}
          </span>

          {naoAutorizado ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-yellow-500/50 text-yellow-400 bg-yellow-500/10 text-[11px] font-bold uppercase tracking-widest">
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              Não Autorizado
            </div>
          ) : (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-bold uppercase tracking-widest
              ${livre
                ? "border-edp-green/40 text-edp-green bg-edp-green/10"
                : "border-edp-red/50 text-edp-red bg-edp-red/10"}`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${livre ? "bg-edp-green" : "bg-edp-red animate-pulse"}`} />
              {livre ? "Disponível" : "Em Uso"}
            </div>
          )}
        </div>
      </div>

      {/* Aviso de acesso não autorizado */}
      {naoAutorizado && (
        <div className="mx-5 mt-3 px-3 py-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-start gap-2">
          <span className="text-yellow-400 text-base leading-none mt-0.5">⚠</span>
          <div>
            <p className="text-yellow-400 text-[11px] font-bold uppercase tracking-wide">Acesso Não Autorizado</p>
            <p className="text-yellow-300/70 text-[10px] mt-0.5">
              Sessão RDP activa sem registo na aplicação.
              {rdp.utilizador ? ` Utilizador Windows: ${rdp.utilizador}.` : ""}
            </p>
          </div>
        </div>
      )}

      {/* Corpo — linhas de info */}
      <div className="flex-1 px-5 py-3">
        <div className="flex items-center justify-between py-2.5 border-b border-edp-border/50">
          <span className="text-[11px] text-edp-muted uppercase tracking-wider font-medium">Operador</span>
          <span className="text-sm font-semibold text-white">{operador || "—"}</span>
        </div>

        <div className="flex items-center justify-between py-2.5 border-b border-edp-border/50">
          <span className="text-[11px] text-edp-muted uppercase tracking-wider font-medium">Eclusa PN</span>
          <StatusEclusa e={eclusas?.PN} />
        </div>

        <div className="flex items-center justify-between py-2.5 border-b border-edp-border/50">
          <span className="text-[11px] text-edp-muted uppercase tracking-wider font-medium">Eclusa RG</span>
          <StatusEclusa e={eclusas?.RG} />
        </div>

        <div className="flex items-center justify-between py-2.5 border-b border-edp-border/50">
          <span className="text-[11px] text-edp-muted uppercase tracking-wider font-medium">Sessão RDP</span>
          {rdp.ocupado ? (
            <span className={`text-sm font-semibold font-mono ${naoAutorizado ? "text-yellow-400" : "text-edp-red"}`}>Ativa</span>
          ) : (
            <span className="text-sm font-semibold font-mono text-edp-green">Livre</span>
          )}
        </div>

        {tempo !== null && (
          <div className="flex items-center justify-between py-2.5 border-b border-edp-border/50">
            <span className="text-[11px] text-edp-muted uppercase tracking-wider font-medium">Duração</span>
            <span className="text-yellow-400 font-mono font-bold text-base tabular-nums">{tempo}</span>
          </div>
        )}

        {!livre && !naoAutorizado && bloqueio.razao && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-edp-red/10 border border-edp-red/20">
            <p className="text-[10px] text-edp-red font-semibold">{bloqueio.razao}</p>
          </div>
        )}
      </div>

      {/* Botões */}
      <div className="px-5 pb-5 pt-2 flex flex-col gap-2">
        {livre && !naoAutorizado ? (
          <button
            onClick={onConectar}
            disabled={conectando}
            className="w-full py-3.5 rounded-lg bg-edp-green hover:bg-green-500 active:bg-green-700 disabled:bg-green-900 disabled:cursor-wait text-white font-bold text-sm tracking-wide transition-all duration-150 cursor-pointer"
          >
            {conectando ? "A ligar..." : "▶  Aceder Eclusa"}
          </button>
        ) : naoAutorizado ? (
          <div className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
            <span className="text-yellow-400 text-xs font-bold">⚠  Aguardar saída do utilizador não autorizado</span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-edp-red/10 border border-edp-red/20">
              <span className="text-edp-red text-xs font-bold">🔒  Acesso Bloqueado</span>
            </div>
            {sessao.conectado && (
              <button
                onClick={onEncerrar}
                className="w-full py-2.5 rounded-lg bg-edp-bg border border-edp-border hover:border-edp-red/50 hover:bg-edp-red/10 text-edp-muted hover:text-red-300 font-semibold text-sm transition-all cursor-pointer"
              >
                ✕  Sair Operação
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
