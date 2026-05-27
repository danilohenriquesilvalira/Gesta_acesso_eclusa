import type { Pagina } from "../../types";

interface Props {
  pagina:    Pagina;
  onPagina:  (p: Pagina) => void;
  utilizador: string;
  onSair:    () => void;
}

const NAV = [
  {
    secao: "Monitor",
    items: [
      { id: "dashboard" as Pagina, label: "Dashboard", icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        </svg>
      )},
    ],
  },
  {
    secao: "Infraestrutura",
    items: [
      { id: "admin-servidores" as Pagina, label: "Servidores", icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/>
          <line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
        </svg>
      )},
    ],
  },
  {
    secao: "Administração",
    items: [
      { id: "admin-usuarios" as Pagina, label: "Utilizadores", icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      )},
      { id: "admin-logs" as Pagina, label: "Auditoria", icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
      )},
      { id: "admin-blacklist" as Pagina, label: "Blacklist IP", icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      )},
    ],
  },
];

export default function AdminSidebar({ pagina, onPagina, utilizador, onSair }: Props) {
  return (
    <aside
      className="shrink-0 flex flex-col h-screen select-none"
      style={{
        width: 240,
        background: "#212E3E",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <div className="px-6 py-6 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3">
          <svg height="28" viewBox="0 0 104 39" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
            <path d="M60.5072 21.7444C60.2784 23.1641 58.5 26.3062 54.1008 26.3062C48.2248 26.3062 46.9768 20.1263 47.1224 19.0407L62.556 19.0302C62.348 13.9256 58.76 9.86483 53.612 9.86483C48.3184 9.86483 44.0232 14.1761 44.0232 19.4896C44.0232 24.803 48.3184 29.1143 53.612 29.1143C58.136 29.1143 61.6304 25.9722 62.556 21.7444H60.5072ZM53.1232 11.8274C56.3264 11.8274 58.6456 13.7794 59.4672 16.9425L47.2992 16.9216C48.0896 13.3723 50.8768 11.8274 53.1232 11.8274ZM94.4112 9.85439C89.1176 9.85439 84.8224 14.1657 84.8224 19.4791V37.4342H87.9008V26.5046C89.4296 28.1957 91.9048 29.1143 94.4216 29.1143C99.7152 29.1143 104.01 24.803 104.01 19.4896C104.01 14.1761 99.7048 9.85439 94.4112 9.85439ZM95.1184 26.9117C91.0832 26.8908 87.984 23.4459 87.9632 18.7693C87.9424 13.863 91.4368 11.8065 93.7872 11.8274C97.812 11.8482 101.015 15.6585 101.036 20.1368C101.046 24.2915 98.176 26.9325 95.1184 26.9117ZM80.08 0V12.4746C78.5096 10.7417 76.076 9.85439 73.5592 9.85439C68.2656 9.85439 63.9704 14.1657 63.9704 19.4791C63.9704 24.7926 68.2656 29.1039 73.5592 29.1039C78.8528 29.1039 83.148 24.7926 83.148 19.4791V0H80.08ZM74.1728 26.9117C70.148 26.8908 66.976 23.1954 66.9552 18.6649C66.9344 14.2596 70.0024 11.8169 72.8416 11.8274C76.8768 11.8482 80.0072 15.4184 80.028 20.0219C80.0384 24.6777 76.7416 26.9325 74.1728 26.9117ZM18.8864 30.0747C26.7384 30.0747 32.9576 23.9783 32.9576 16.0969C32.9576 11.4202 31.3248 9.85439 31.3248 9.85439C34.0496 12.3702 35.1104 16.2013 35.1104 19.4687C35.1104 26.8386 29.0992 32.6218 21.4344 32.6218C16.2968 32.6218 12.7712 30.6279 10.4832 27.2666C10.4832 27.277 13.416 30.0747 18.8864 30.0747ZM11.5752 20.0846C11.5752 14.6146 15.9848 10.4807 21.4344 10.4807C23.244 10.4807 24.8352 11.1071 25.4072 11.6081C25.4072 11.6081 23.7224 8.20503 18.7824 8.20503C16.4112 8.20503 14.1752 9.16542 12.4904 10.8983C10.8056 12.6207 9.8904 14.8964 9.8904 17.2869C9.8904 20.523 12.272 22.8927 12.272 22.8927C11.8456 22.2872 11.5752 20.69 11.5752 20.0846ZM38.8128 19.4791C38.8128 30.2417 30.1288 38.9582 19.4064 38.9582C8.684 38.9582 0 30.2417 0 19.4791C0 8.71654 8.684 0 19.4064 0C30.1288 0 38.8128 8.71654 38.8128 19.4791ZM35.8384 18.3308C35.62 14.2283 33.7688 10.345 30.3368 7.99625C22.5888 2.50535 9.62 6.01285 9.1104 16.5353C8.9128 20.095 10.5872 23.185 13.6344 24.9178C13.676 24.9491 13.728 24.97 13.7696 25.0013C13.8112 25.0222 13.8528 25.0535 13.9048 25.0744C13.9152 25.0849 13.936 25.0849 13.9464 25.0953C16.5672 26.5254 19.9888 26.2331 22.5264 24.709C24.5024 23.5399 25.9064 21.6191 25.8232 19.333C25.7712 17.9446 25.2408 16.3996 24.2424 15.3766C22.828 13.9047 20.3632 13.8108 18.8656 15.1887C18.0336 15.9299 17.628 17.0677 17.6592 18.1743C17.6592 19.5104 18.9488 20.8362 20.9144 20.8362C22.8696 20.8362 24.6584 19.3225 24.6584 17.1095C24.9912 18.0072 25.1472 18.5501 25.1472 19.4687C25.1472 21.4208 23.2856 23.6234 20.488 23.6234C18.6472 23.6234 17.4408 22.924 16.9 22.4334C15.7872 21.3999 14.872 20.0741 14.7264 18.5292C14.5808 16.4936 15.3504 14.3849 16.8896 13.007C19.5208 10.5747 23.8368 10.7313 26.312 13.2993C27.8616 14.886 28.652 17.026 28.756 19.239C28.9744 26.0661 21.0912 30.1999 15.0592 28.6341C14.196 28.4253 13.3536 28.1017 12.5736 27.6737C12.5632 27.6737 12.5528 27.6633 12.5528 27.6633C12.5008 27.632 12.4488 27.6006 12.3968 27.5798C12.0328 27.3814 11.6688 27.1622 11.3256 26.9221C8.3096 24.9178 6.396 21.5356 6.1984 17.9028C5.928 13.9047 7.5296 9.86483 10.3688 7.01499C12.8544 4.53051 16.5776 3.06906 20.1136 2.88116C20.7584 2.84984 21.4344 2.8916 22.1728 2.95423C22.2456 2.96467 22.308 2.91247 22.3184 2.8394C22.3288 2.76633 22.2768 2.70369 22.204 2.69325C18.7512 2.28613 15.2152 3.36135 14.1856 3.77891C14.1856 3.77891 14.1752 3.77891 14.1648 3.78935C8.1432 5.95021 4.1392 11.0653 3.2032 16.5353C3.2032 16.5458 3.2032 16.5458 3.2032 16.5562C1.3832 26.5567 9.0792 35.8683 19.448 36.0145C29.0368 36.1502 36.5352 27.8616 35.8384 18.3308Z" fill="white"/>
          </svg>
          <p className="text-white font-extrabold text-[13px] leading-tight whitespace-nowrap">Controlo de Acesso</p>
        </div>
      </div>

      {/* ── Navegação ─────────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {NAV.map(({ secao, items }) => (
          <div key={secao} className="mb-6">
            <p className="px-3 mb-2 text-[10px] font-extrabold uppercase tracking-[0.22em]"
              style={{ color: "rgba(255,255,255,0.25)" }}>
              {secao}
            </p>
            {items.map(({ id, label, icon }) => {
              const ativo = pagina === id;
              return (
                <button key={id} onClick={() => onPagina(id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-[13px] font-semibold cursor-pointer transition-all"
                  style={{
                    background: ativo ? "rgba(255,255,255,0.08)" : "transparent",
                    color:      ativo ? "#ffffff" : "rgba(255,255,255,0.45)",
                  }}
                  onMouseEnter={e => { if (!ativo) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.75)"; }}
                  onMouseLeave={e => { if (!ativo) { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.45)"; } }}
                >
                  <span style={{ opacity: ativo ? 1 : 0.6 }}>{icon}</span>
                  {label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── Utilizador ────────────────────────────────────────────────────── */}
      <div className="shrink-0 p-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl mb-1"
          style={{ background: "rgba(255,255,255,0.04)" }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-[13px] shrink-0"
            style={{ background: "rgba(255,255,255,0.1)", color: "#ffffff" }}>
            {utilizador.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-[13px] truncate leading-tight">{utilizador}</p>
            <p className="text-[10px] font-medium leading-none mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Administrador</p>
          </div>
        </div>
        <button onClick={onSair}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-bold cursor-pointer transition-all"
          style={{ color: "rgba(255,255,255,0.4)" }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(227,44,44,0.1)";
            (e.currentTarget as HTMLButtonElement).style.color = "#E32C2C";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)";
          }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Sair do Sistema
        </button>
      </div>
    </aside>
  );
}
