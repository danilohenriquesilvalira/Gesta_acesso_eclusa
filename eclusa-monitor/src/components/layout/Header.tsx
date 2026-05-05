type Pagina = "dashboard" | "admin-usuarios" | "admin-logs";

interface Props {
  utilizador:   string;
  ehAdmin:      boolean;
  agora:        Date;
  apiOk:        boolean | null;
  pagina:       Pagina;
  onPagina:     (p: Pagina) => void;
  onLoginClick: () => void;
  onSair:       () => void;
}



export default function Header({ utilizador, ehAdmin, agora, apiOk, pagina, onPagina, onLoginClick, onSair }: Props) {


  return (
    <header 
      className="shrink-0 select-none sticky top-0 z-50 bg-[#212E3E]"
      style={{ 
        borderBottom: "1px solid #374151" 
      }}
    >
      <div className="flex items-center h-[76px] px-12">

        {/* ── SEÇÃO LOGO E TÍTULO (Imponente e Alinhado) ─────────── */}
        <div className="flex items-center gap-6">
          <svg height="38" viewBox="0 0 104 39" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-100 drop-shadow-md">
            <path d="M60.5072 21.7444C60.2784 23.1641 58.5 26.3062 54.1008 26.3062C48.2248 26.3062 46.9768 20.1263 47.1224 19.0407L62.556 19.0302C62.348 13.9256 58.76 9.86483 53.612 9.86483C48.3184 9.86483 44.0232 14.1761 44.0232 19.4896C44.0232 24.803 48.3184 29.1143 53.612 29.1143C58.136 29.1143 61.6304 25.9722 62.556 21.7444H60.5072ZM53.1232 11.8274C56.3264 11.8274 58.6456 13.7794 59.4672 16.9425L47.2992 16.9216C48.0896 13.3723 50.8768 11.8274 53.1232 11.8274ZM94.4112 9.85439C89.1176 9.85439 84.8224 14.1657 84.8224 19.4791V37.4342H87.9008V26.5046C89.4296 28.1957 91.9048 29.1143 94.4216 29.1143C99.7152 29.1143 104.01 24.803 104.01 19.4896C104.01 14.1761 99.7048 9.85439 94.4112 9.85439ZM95.1184 26.9117C91.0832 26.8908 87.984 23.4459 87.9632 18.7693C87.9424 13.863 91.4368 11.8065 93.7872 11.8274C97.812 11.8482 101.015 15.6585 101.036 20.1368C101.046 24.2915 98.176 26.9325 95.1184 26.9117ZM80.08 0V12.4746C78.5096 10.7417 76.076 9.85439 73.5592 9.85439C68.2656 9.85439 63.9704 14.1657 63.9704 19.4791C63.9704 24.7926 68.2656 29.1039 73.5592 29.1039C78.8528 29.1039 83.148 24.7926 83.148 19.4791V0H80.08ZM74.1728 26.9117C70.148 26.8908 66.976 23.1954 66.9552 18.6649C66.9344 14.2596 70.0024 11.8169 72.8416 11.8274C76.8768 11.8482 80.0072 15.4184 80.028 20.0219C80.0384 24.6777 76.7416 26.9325 74.1728 26.9117ZM18.8864 30.0747C26.7384 30.0747 32.9576 23.9783 32.9576 16.0969C32.9576 11.4202 31.3248 9.85439 31.3248 9.85439C34.0496 12.3702 35.1104 16.2013 35.1104 19.4687C35.1104 26.8386 29.0992 32.6218 21.4344 32.6218C16.2968 32.6218 12.7712 30.6279 10.4832 27.2666C10.4832 27.277 13.416 30.0747 18.8864 30.0747ZM11.5752 20.0846C11.5752 14.6146 15.9848 10.4807 21.4344 10.4807C23.244 10.4807 24.8352 11.1071 25.4072 11.6081C25.4072 11.6081 23.7224 8.20503 18.7824 8.20503C16.4112 8.20503 14.1752 9.16542 12.4904 10.8983C10.8056 12.6207 9.8904 14.8964 9.8904 17.2869C9.8904 20.523 12.272 22.8927 12.272 22.8927C11.8456 22.2872 11.5752 20.69 11.5752 20.0846ZM38.8128 19.4791C38.8128 30.2417 30.1288 38.9582 19.4064 38.9582C8.684 38.9582 0 30.2417 0 19.4791C0 8.71654 8.684 0 19.4064 0C30.1288 0 38.8128 8.71654 38.8128 19.4791ZM35.8384 18.3308C35.62 14.2283 33.7688 10.345 30.3368 7.99625C22.5888 2.50535 9.62 6.01285 9.1104 16.5353C8.9128 20.095 10.5872 23.185 13.6344 24.9178C13.676 24.9491 13.728 24.97 13.7696 25.0013C13.8112 25.0222 13.8528 25.0535 13.9048 25.0744C13.9152 25.0849 13.936 25.0849 13.9464 25.0953C16.5672 26.5254 19.9888 26.2331 22.5264 24.709C24.5024 23.5399 25.9064 21.6191 25.8232 19.333C25.7712 17.9446 25.2408 16.3996 24.2424 15.3766C22.828 13.9047 20.3632 13.8108 18.8656 15.1887C18.0336 15.9299 17.628 17.0677 17.6592 18.1743C17.6592 19.5104 18.9488 20.8362 20.9144 20.8362C22.8696 20.8362 24.6584 19.3225 24.6584 17.1095C24.9912 18.0072 25.1472 18.5501 25.1472 19.4687C25.1472 21.4208 23.2856 23.6234 20.488 23.6234C18.6472 23.6234 17.4408 22.924 16.9 22.4334C15.7872 21.3999 14.872 20.0741 14.7264 18.5292C14.5808 16.4936 15.3504 14.3849 16.8896 13.007C19.5208 10.5747 23.8368 10.7313 26.312 13.2993C27.8616 14.886 28.652 17.026 28.756 19.239C28.9744 26.0661 21.0912 30.1999 15.0592 28.6341C14.196 28.4253 13.3536 28.1017 12.5736 27.6737C12.5632 27.6737 12.5528 27.6633 12.5528 27.6633C12.5008 27.632 12.4488 27.6006 12.3968 27.5798C12.0328 27.3814 11.6688 27.1622 11.3256 26.9221C8.3096 24.9178 6.396 21.5356 6.1984 17.9028C5.928 13.9047 7.5296 9.86483 10.3688 7.01499C12.8544 4.53051 16.5776 3.06906 20.1136 2.88116C20.7584 2.84984 21.4344 2.8916 22.1728 2.95423C22.2456 2.96467 22.308 2.91247 22.3184 2.8394C22.3288 2.76633 22.2768 2.70369 22.204 2.69325C18.7512 2.28613 15.2152 3.36135 14.1856 3.77891C14.1856 3.77891 14.1752 3.77891 14.1648 3.78935C8.1432 5.95021 4.1392 11.0653 3.2032 16.5353C3.2032 16.5458 3.2032 16.5458 3.2032 16.5562C1.3832 26.5567 9.0792 35.8683 19.448 36.0145C29.0368 36.1502 36.5352 27.8616 35.8384 18.3308Z" fill="white"/>
          </svg>
          <span className="text-white font-extrabold text-[18px] tracking-tight ml-2">
            Controlo de Acesso — Eclusas de Navegação
          </span>
        </div>

        {/* ── NAVEGAÇÃO CENTRAL (Alinhada ao Meio) ───────────── */}
        <div className="flex-1 flex justify-center">
          <nav className="flex items-center gap-1">
            {ehAdmin && (
              <>
                <button
                  onClick={() => onPagina("admin-usuarios")}
                  className={`px-6 py-2 rounded-full text-[13px] font-bold transition-all ${
                    pagina === "admin-usuarios"
                      ? "text-white bg-white/10"
                      : "text-white/40 hover:text-white"
                  }`}
                >
                  Utilizadores
                </button>
                <button
                  onClick={() => onPagina("admin-logs")}
                  className={`px-6 py-2 rounded-full text-[13px] font-bold transition-all ${
                    pagina === "admin-logs"
                      ? "text-white bg-white/10"
                      : "text-white/40 hover:text-white"
                  }`}
                >
                  Logs
                </button>
              </>
            )}
          </nav>
        </div>

        {/* ── SEÇÃO DIREITA (Perfeitamente Alinhada e Centralizada) ── */}
        <div className="flex items-center gap-8 ml-auto">
          
          {/* 1. Relógio (Centralizado Internamente) */}
          <div className="flex flex-col items-center min-w-[120px]">
            <span className="text-white font-light text-[24px] font-mono tabular-nums leading-none tracking-tighter">
              {agora.toLocaleTimeString("pt-PT", { hour12: false })}
            </span>
            <span className="text-white/20 text-[10px] mt-2 font-black uppercase tracking-[0.2em] whitespace-nowrap">
              {agora.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" })}
            </span>
          </div>

          <div className="w-[1px] h-8 bg-white/10" />

          {/* 2. Ícone de Conexão (Centralizado no Eixo) */}
          <div title={apiOk ? "Sistema Online" : "Erro de Conexão"} className="flex items-center opacity-80 hover:opacity-100 transition-opacity">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={apiOk ? "#00A651" : "#E30613"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>
            </svg>
          </div>

          {/* 3. Ícone de Utilizador (Centralizado no Eixo) */}
          <div className="flex items-center">
            {utilizador ? (
              <button onClick={onSair} title={`Sair (${utilizador})`} className="w-10 h-10 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all shadow-sm">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </button>
            ) : (
              <button 
                onClick={onLoginClick} 
                title="Aceder ao Sistema"
                className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-white/30 hover:text-white hover:border-white/30 transition-all"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </button>
            )}
          </div>

        </div>

      </div>
    </header>
  );
}
