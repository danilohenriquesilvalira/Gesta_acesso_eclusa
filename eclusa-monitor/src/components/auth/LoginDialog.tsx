import { useState, useEffect, useRef } from "react";

interface Props {
  isOpen:    boolean;
  canClose:  boolean;
  apiUrl:    string;
  semUsers:  boolean;
  onLogin:   (username: string) => void;
  onClose:   () => void;
  onIrAdmin: () => void;
}

const EdpLogoWhite = () => (
  <svg height="28" viewBox="0 0 104 39" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M60.5072 21.7444C60.2784 23.1641 58.5 26.3062 54.1008 26.3062C48.2248 26.3062 46.9768 20.1263 47.1224 19.0407L62.556 19.0302C62.348 13.9256 58.76 9.86483 53.612 9.86483C48.3184 9.86483 44.0232 14.1761 44.0232 19.4896C44.0232 24.803 48.3184 29.1143 53.612 29.1143C58.136 29.1143 61.6304 25.9722 62.556 21.7444H60.5072ZM53.1232 11.8274C56.3264 11.8274 58.6456 13.7794 59.4672 16.9425L47.2992 16.9216C48.0896 13.3723 50.8768 11.8274 53.1232 11.8274ZM94.4112 9.85439C89.1176 9.85439 84.8224 14.1657 84.8224 19.4791V37.4342H87.9008V26.5046C89.4296 28.1957 91.9048 29.1143 94.4216 29.1143C99.7152 29.1143 104.01 24.803 104.01 19.4896C104.01 14.1761 99.7048 9.85439 94.4112 9.85439ZM95.1184 26.9117C91.0832 26.8908 87.984 23.4459 87.9632 18.7693C87.9424 13.863 91.4368 11.8065 93.7872 11.8274C97.812 11.8482 101.015 15.6585 101.036 20.1368C101.046 24.2915 98.176 26.9325 95.1184 26.9117ZM80.08 0V12.4746C78.5096 10.7417 76.076 9.85439 73.5592 9.85439C68.2656 9.85439 63.9704 14.1657 63.9704 19.4791C63.9704 24.7926 68.2656 29.1039 73.5592 29.1039C78.8528 29.1039 83.148 24.7926 83.148 19.4791V0H80.08ZM74.1728 26.9117C70.148 26.8908 66.976 23.1954 66.9552 18.6649C66.9344 14.2596 70.0024 11.8169 72.8416 11.8274C76.8768 11.8482 80.0072 15.4184 80.028 20.0219C80.0384 24.6777 76.7416 26.9325 74.1728 26.9117ZM18.8864 30.0747C26.7384 30.0747 32.9576 23.9783 32.9576 16.0969C32.9576 11.4202 31.3248 9.85439 31.3248 9.85439C34.0496 12.3702 35.1104 16.2013 35.1104 19.4687C35.1104 26.8386 29.0992 32.6218 21.4344 32.6218C16.2968 32.6218 12.7712 30.6279 10.4832 27.2666C10.4832 27.277 13.416 30.0747 18.8864 30.0747ZM11.5752 20.0846C11.5752 14.6146 15.9848 10.4807 21.4344 10.4807C23.244 10.4807 24.8352 11.1071 25.4072 11.6081C25.4072 11.6081 23.7224 8.20503 18.7824 8.20503C16.4112 8.20503 14.1752 9.16542 12.4904 10.8983C10.8056 12.6207 9.8904 14.8964 9.8904 17.2869C9.8904 20.523 12.272 22.8927 12.272 22.8927C11.8456 22.2872 11.5752 20.69 11.5752 20.0846ZM38.8128 19.4791C38.8128 30.2417 30.1288 38.9582 19.4064 38.9582C8.684 38.9582 0 30.2417 0 19.4791C0 8.71654 8.684 0 19.4064 0C30.1288 0 38.8128 8.71654 38.8128 19.4791ZM35.8384 18.3308C35.62 14.2283 33.7688 10.345 30.3368 7.99625C22.5888 2.50535 9.62 6.01285 9.1104 16.5353C8.9128 20.095 10.5872 23.185 13.6344 24.9178C13.676 24.9491 13.728 24.97 13.7696 25.0013C13.8112 25.0222 13.8528 25.0535 13.9048 25.0744C13.9152 25.0849 13.936 25.0849 13.9464 25.0953C16.5672 26.5254 19.9888 26.2331 22.5264 24.709C24.5024 23.5399 25.9064 21.6191 25.8232 19.333C25.7712 17.9446 25.2408 16.3996 24.2424 15.3766C22.828 13.9047 20.3632 13.8108 18.8656 15.1887C18.0336 15.9299 17.628 17.0677 17.6592 18.1743C17.6592 19.5104 18.9488 20.8362 20.9144 20.8362C22.8696 20.8362 24.6584 19.3225 24.6584 17.1095C24.9912 18.0072 25.1472 18.5501 25.1472 19.4687C25.1472 21.4208 23.2856 23.6234 20.488 23.6234C18.6472 23.6234 17.4408 22.924 16.9 22.4334C15.7872 21.3999 14.872 20.0741 14.7264 18.5292C14.5808 16.4936 15.3504 14.3849 16.8896 13.007C19.5208 10.5747 23.8368 10.7313 26.312 13.2993C27.8616 14.886 28.652 17.026 28.756 19.239C28.9744 26.0661 21.0912 30.1999 15.0592 28.6341C14.196 28.4253 13.3536 28.1017 12.5736 27.6737C12.5632 27.6737 12.5528 27.6633 12.5528 27.6633C12.5008 27.632 12.4488 27.6006 12.3968 27.5798C12.0328 27.3814 11.6688 27.1622 11.3256 26.9221C8.3096 24.9178 6.396 21.5356 6.1984 17.9028C5.928 13.9047 7.5296 9.86483 10.3688 7.01499C12.8544 4.53051 16.5776 3.06906 20.1136 2.88116C20.7584 2.84984 21.4344 2.8916 22.1728 2.95423C22.2456 2.96467 22.308 2.91247 22.3184 2.8394C22.3288 2.76633 22.2768 2.70369 22.204 2.69325C18.7512 2.28613 15.2152 3.36135 14.1856 3.77891C14.1856 3.77891 14.1752 3.77891 14.1648 3.78935C8.1432 5.95021 4.1392 11.0653 3.2032 16.5353C3.2032 16.5458 3.2032 16.5458 3.2032 16.5562C1.3832 26.5567 9.0792 35.8683 19.448 36.0145C29.0368 36.1502 36.5352 27.8616 35.8384 18.3308Z" fill="white"/>
  </svg>
);

export default function LoginDialog({ isOpen, canClose, apiUrl, semUsers, onLogin, onClose, onIrAdmin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [erro,     setErro]     = useState("");
  const [loading,  setLoading]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) { setTimeout(() => inputRef.current?.focus(), 60); }
    else { setErro(""); setUsername(""); setPassword(""); }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;

    // ── Acesso dev local (apenas desenvolvimento) ─────────────────────────
    if (username.trim() === "dev" && password === "1234") {
      onLogin("dev");
      onIrAdmin();
      setUsername(""); setPassword("");
      return;
    }
    // ─────────────────────────────────────────────────────────────────────

    setLoading(true);
    setErro("");
    try {
      const r = await fetch(`${apiUrl}/auth/login`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username: username.trim(), password }),
      });
      const data = await r.json();
      if (data.ok) {
        onLogin(username.trim());
        setUsername(""); setPassword("");
      } else {
        setErro(data.erro ?? "Credenciais inválidas.");
      }
    } catch {
      setErro("Sem ligação à API. Verifique a rede.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.55)" }}
        onClick={canClose ? onClose : undefined}
      />

      {/* Dialog */}
      <div
        className="relative flex overflow-hidden"
        style={{
          width: 780,
          minHeight: 560,
          borderRadius: 20,
          boxShadow: "0 32px 80px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.25)",
        }}
      >
        {/* ── Painel esquerdo — azul marinho EDP ── */}
        <div
          className="flex flex-col justify-between px-10 py-10"
          style={{ background: "#212E3E", width: 300, flexShrink: 0 }}
        >
          <div>
            <EdpLogoWhite />
            <div className="mt-6">
              <p className="text-white font-extrabold text-[22px] leading-tight">
                Sistema de<br />Controlo de Acesso
              </p>
              <p className="text-white/45 text-[13px] mt-2 leading-relaxed">
                Eclusas de Navegacao WinCC
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: "#00A651" }} />
              <span className="text-white/40 text-[11px] font-medium">Acesso RDP seguro</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: "#00A651" }} />
              <span className="text-white/40 text-[11px] font-medium">Logs de auditoria</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: "#00A651" }} />
              <span className="text-white/40 text-[11px] font-medium">Monitoramento em tempo real</span>
            </div>
          </div>
        </div>

        {/* ── Painel direito — formulário branco ── */}
        <div className="flex-1 bg-white flex flex-col justify-between px-12 py-12">
          {semUsers ? (
            <div className="flex flex-col h-full justify-between">
              <div>
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-[22px] font-extrabold mb-4"
                  style={{ background: "#fef3c7", color: "#d97706" }}
                >
                  !
                </div>
                <p className="font-extrabold text-[20px]" style={{ color: "#0f172a" }}>
                  Sem utilizadores
                </p>
                <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: "#64748b" }}>
                  Crie o primeiro administrador para começar a usar o sistema de controlo de acesso.
                </p>
              </div>
              <button
                onClick={onIrAdmin}
                className="w-full py-3.5 rounded-xl font-extrabold text-[14px] text-white transition-all cursor-pointer"
                style={{ background: "#212E3E", boxShadow: "0 2px 8px rgba(33,46,62,0.25)" }}
              >
                Configurar Sistema
              </button>
            </div>
          ) : (
            <div className="flex flex-col h-full justify-center gap-8">
              <div className="text-center">
                <p className="font-extrabold text-[24px] leading-none" style={{ color: "#0f172a" }}>
                  Autenticacao
                </p>
                <p className="text-[13px] mt-2" style={{ color: "#94a3b8" }}>
                  Introduza as suas credenciais de operador
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {/* Utilizador */}
                <div>
                  <label
                    className="block font-extrabold uppercase tracking-widest mb-2"
                    style={{ fontSize: 10, color: "#0f172a" }}
                  >
                    Utilizador
                  </label>
                  <input
                    ref={inputRef}
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Nome de utilizador"
                    autoComplete="username"
                    style={{
                      width: "100%",
                      border: "1.5px solid #e2e8f0",
                      borderRadius: 12,
                      padding: "13px 16px",
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#0f172a",
                      outline: "none",
                      fontFamily: "Mulish, sans-serif",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = "#212E3E")}
                    onBlur={e  => (e.currentTarget.style.borderColor = "#e2e8f0")}
                  />
                </div>

                {/* Senha */}
                <div>
                  <label
                    className="block font-extrabold uppercase tracking-widest mb-2"
                    style={{ fontSize: 10, color: "#0f172a" }}
                  >
                    Senha
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    style={{
                      width: "100%",
                      border: "1.5px solid #e2e8f0",
                      borderRadius: 12,
                      padding: "13px 16px",
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#0f172a",
                      outline: "none",
                      fontFamily: "Mulish, sans-serif",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = "#212E3E")}
                    onBlur={e  => (e.currentTarget.style.borderColor = "#e2e8f0")}
                  />
                </div>

                {/* Erro */}
                {erro && (
                  <div
                    className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ background: "#fff1f2", border: "1.5px solid #fecdd3" }}
                  >
                    <span style={{ color: "#e11d48", fontSize: 15 }}>&#9888;</span>
                    <p className="text-[13px] font-semibold" style={{ color: "#be123c" }}>{erro}</p>
                  </div>
                )}
              </form>

              <button
                type="submit"
                onClick={handleSubmit}
                disabled={!username.trim() || !password || loading}
                className="w-full rounded-xl font-extrabold text-[14px] text-white transition-all cursor-pointer disabled:cursor-not-allowed"
                style={{
                  padding: "15px 0",
                  background: (!username.trim() || !password || loading) ? "#e2e8f0" : "#212E3E",
                  color:      (!username.trim() || !password || loading) ? "#94a3b8" : "#ffffff",
                  boxShadow:  (!username.trim() || !password || loading) ? "none" : "0 4px 14px rgba(33,46,62,0.30)",
                  letterSpacing: "0.03em",
                }}
              >
                {loading ? "A verificar..." : "Entrar no Sistema"}
              </button>
            </div>
          )}
        </div>

        {/* Botão fechar */}
        {canClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-5 transition-colors cursor-pointer"
            style={{ color: "rgba(255,255,255,0.3)", fontSize: 24, lineHeight: 1, fontWeight: 300 }}
            onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
