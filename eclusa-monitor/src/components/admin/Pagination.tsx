interface Props {
  page:     number;
  total:    number;
  perPage:  number;
  onChange: (p: number) => void;
}

export default function Pagination({ page, total, perPage, onChange }: Props) {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return null;

  const from = (page - 1) * perPage + 1;
  const to   = Math.min(page * perPage, total);

  const window5: number[] = [];
  let start = Math.max(1, Math.min(page - 2, pages - 4));
  for (let i = start; i <= Math.min(start + 4, pages); i++) window5.push(i);

  const btn = (label: React.ReactNode, p: number, disabled = false, active = false) => (
    <button key={String(label)} onClick={() => !disabled && onChange(p)} disabled={disabled}
      className="min-w-[32px] h-8 px-2 rounded-lg text-[12px] font-bold transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
      style={{
        background: active ? "#225E66" : "rgba(255,255,255,0.06)",
        color:      active ? "#FFFFFF" : "rgba(255,255,255,0.5)",
        border:     active ? "1px solid rgba(34,94,102,0.5)" : "1px solid rgba(255,255,255,0.08)",
      }}
      onMouseEnter={e => { if (!active && !disabled) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)"; }}
      onMouseLeave={e => { if (!active && !disabled) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}
    >
      {label}
    </button>
  );

  return (
    <div className="shrink-0 flex items-center justify-between px-6 py-3"
      style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
      <span className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.3)" }}>
        {from}–{to} de {total} {total === 1 ? "registo" : "registos"}
      </span>
      <div className="flex items-center gap-1">
        {btn("←", page - 1, page === 1)}
        {start > 1 && (<>
          {btn(1, 1, false, page === 1)}
          {start > 2 && <span className="px-1 text-[12px]" style={{ color: "rgba(255,255,255,0.25)" }}>…</span>}
        </>)}
        {window5.map(p => btn(p, p, false, p === page))}
        {start + 4 < pages && (<>
          {start + 5 < pages && <span className="px-1 text-[12px]" style={{ color: "rgba(255,255,255,0.25)" }}>…</span>}
          {btn(pages, pages, false, page === pages)}
        </>)}
        {btn("→", page + 1, page === pages)}
      </div>
    </div>
  );
}
