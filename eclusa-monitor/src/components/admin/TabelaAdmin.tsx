import { useState } from "react";
import Pagination from "./Pagination";

export interface ColunaConfig<T> {
  header:  string;
  width?:  string;
  center?: boolean;
  render:  (row: T) => React.ReactNode;
}

interface Props<T> {
  dados:   T[];
  colunas: ColunaConfig<T>[];
  keyFn:   (row: T) => string | number;

  toolbar?:        React.ReactNode;
  rowLeftBorder?:  (row: T) => string;

  loading?:       boolean;
  emptyTitle?:    string;
  emptySubtitle?: string;
  emptyIcon?:     React.ReactNode;

  page:         number;
  total:        number;
  perPage:      number;
  onPageChange: (p: number) => void;

  fillHeight?: boolean;
  className?:  string;
}

// Padding lateral uniforme — header e linhas usam o mesmo valor
// A borda esquerda das linhas (3px) é compensada com paddingLeft reduzido
const PX = 20;           // px-5 = 20px
const BORDER_W = 3;      // borda esquerda das linhas

export default function TabelaAdmin<T>({
  dados, colunas, keyFn,
  toolbar,
  rowLeftBorder,
  loading = false,
  emptyTitle = "Sem registos",
  emptySubtitle,
  emptyIcon,
  page, total, perPage, onPageChange,
  fillHeight = true,
  className = "",
}: Props<T>) {
  const [hoverId, setHoverId] = useState<string | number | null>(null);
  const grid = colunas.map(c => c.width ?? "1fr").join(" ");

  const DefaultEmptyIcon = () => (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  );

  return (
    <div
      className={`rounded-2xl overflow-hidden ${fillHeight ? "flex flex-col min-h-0" : ""} ${className}`}
      style={{
        background: "rgba(255,255,255,0.04)",
        border:     "1px solid rgba(255,255,255,0.09)",
        borderTop:  "2px solid rgba(34,94,102,0.6)",
      }}
    >
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      {toolbar && (
        <div className="shrink-0 py-3"
          style={{
            padding:      `12px ${PX}px`,
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            background:   "rgba(255,255,255,0.02)",
          }}>
          {toolbar}
        </div>
      )}

      {/* ── Cabeçalho das colunas ─────────────────────────────────────────── */}
      {!loading && total > 0 && (
        <div
          className="shrink-0 grid items-center"
          style={{
            gridTemplateColumns: grid,
            // Header tem borderLeft transparente de 3px para compensar o offset das linhas
            paddingLeft:    PX + BORDER_W,
            paddingRight:   PX,
            paddingTop:     10,
            paddingBottom:  10,
            borderLeft:     `${BORDER_W}px solid transparent`,
            background:     "rgba(34,94,102,0.15)",
            borderBottom:   "1px solid rgba(34,94,102,0.3)",
          }}>
          {colunas.map(c => (
            <p key={c.header}
              className="text-[10px] font-extrabold uppercase tracking-[0.16em] leading-none"
              style={{
                color:     "rgba(255,255,255,0.5)",
                textAlign: c.center ? "center" : "left",
              }}>
              {c.header}
            </p>
          ))}
        </div>
      )}

      {/* ── Corpo ────────────────────────────────────────────────────────── */}
      <div className={fillHeight ? "flex-1 overflow-auto" : ""}>
        {loading ? (
          <div className="flex items-center justify-center h-32 gap-3">
            <div className="w-5 h-5 border-2 rounded-full animate-spin"
              style={{ borderColor: "rgba(255,255,255,0.08)", borderTopColor: "#225E66" }} />
            <span className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>A carregar...</span>
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.04)" }}>
              {emptyIcon ?? <DefaultEmptyIcon />}
            </div>
            <div className="text-center">
              <p className="text-[15px] font-bold" style={{ color: "rgba(255,255,255,0.7)" }}>{emptyTitle}</p>
              {emptySubtitle && <p className="text-[12px] mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>{emptySubtitle}</p>}
            </div>
          </div>
        ) : (
          dados.map((row, i) => {
            const k       = keyFn(row);
            const isHover = hoverId === k;
            const accent  = rowLeftBorder?.(row) ?? "transparent";
            const leftColor = isHover && accent === "transparent"
              ? "rgba(34,94,102,0.6)"
              : accent;
            return (
              <div key={k}
                className="grid items-center"
                style={{
                  gridTemplateColumns: grid,
                  paddingLeft:   PX,          // borda ocupa BORDER_W, padding fica igual
                  paddingRight:  PX,
                  paddingTop:    14,
                  paddingBottom: 14,
                  borderBottom:  "1px solid rgba(255,255,255,0.05)",
                  borderLeft:    `${BORDER_W}px solid ${leftColor}`,
                  background:    isHover
                    ? "rgba(255,255,255,0.06)"
                    : i % 2 === 1
                    ? "rgba(255,255,255,0.02)"
                    : "transparent",
                  transition: "background 0.1s",
                }}
                onMouseEnter={() => setHoverId(k)}
                onMouseLeave={() => setHoverId(null)}>
                {colunas.map(c => (
                  <div key={c.header} style={{ textAlign: c.center ? "center" : "left" as const }}>
                    {c.render(row)}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>

      {/* ── Paginação ────────────────────────────────────────────────────── */}
      <Pagination page={page} total={total} perPage={perPage} onChange={onPageChange} />
    </div>
  );
}
