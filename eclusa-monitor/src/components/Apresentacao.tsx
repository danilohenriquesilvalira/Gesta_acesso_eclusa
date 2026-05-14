import React, { useState, useRef, useEffect } from "react";
import RedeAnalise from "./RedeAnalise";

// ── paleta ────────────────────────────────────────────────────────────────────
const C = {
  ink:    "#1a1a1a",
  paper:  "#fbf9f4",
  paper2: "#f3efe6",
  navy:   "#212E3E",
  blue:   "#1B4F9C",
  light:  "#4DAEE5",
  red:    "#E30613",
  green:  "#00A651",
  accent: "#FACC15",
  muted:  "rgba(0,0,0,0.45)",
};

// ── primitivas visuais ────────────────────────────────────────────────────────

function AlertBox({ children, color = C.red }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{
      border: `2px solid ${color}`, borderRadius: 10, padding: "14px 18px",
      background: color + "18", display: "flex", gap: 12, alignItems: "flex-start",
    }}>
      <div style={{ color, fontSize: 20, lineHeight: 1, fontFamily: "'Caveat', cursive", fontWeight: 900, flexShrink: 0 }}>!</div>
      <div style={{ fontFamily: "'Mulish', sans-serif", fontSize: 14, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

function Cross({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
      <div style={{ width: 22, height: 22, border: `2px solid ${C.red}`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: C.red, fontFamily: "'Caveat', cursive", fontWeight: 900, fontSize: 16, flexShrink: 0, marginTop: 2 }}>X</div>
      <span style={{ fontFamily: "'Mulish', sans-serif", fontSize: 14, lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

function Check({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
      <div style={{ width: 22, height: 22, border: `2px solid ${C.green}`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: C.green, fontFamily: "'Caveat', cursive", fontWeight: 900, fontSize: 16, flexShrink: 0, marginTop: 2 }}>V</div>
      <span style={{ fontFamily: "'Mulish', sans-serif", fontSize: 14, lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

// ── Sidebar sticky ─────────────────────────────────────────────────────────────
function Aside({ titulo, pontos, pills }: {
  titulo: string;
  pontos: { label?: string; text: string }[];
  pills?: string[];
}) {
  return (
    <div style={{
      position: "sticky", top: 140,
      border: `2px dashed ${C.ink}`, borderRadius: 14, padding: 18,
      background: "rgba(255,255,255,0.5)",
    }}>
      <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 26, marginBottom: 4 }}>{titulo}</div>
      <div style={{ height: 10, width: 160, marginBottom: 10, backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 10'><path d='M0 5 Q 10 0 20 5 T 40 5 T 60 5 T 80 5' stroke='%231a1a1a' stroke-width='1.5' fill='none'/></svg>")`, backgroundRepeat: "repeat-x", backgroundSize: "80px 10px", opacity: 0.5 }} />
      <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontFamily: "'Kalam', cursive", fontSize: 13, lineHeight: 1.5 }}>
        {pontos.map((p, i) => (
          <li key={i} style={{ marginBottom: 6 }}>{p.label && <b>{p.label} </b>}{p.text}</li>
        ))}
      </ul>
      {pills && (
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {pills.map(p => (
            <span key={p} style={{ fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 11, display: "inline-block", padding: "2px 8px", border: `1.5px solid ${C.ink}`, borderRadius: 10 }}>{p}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SISTEMA ACTUAL
// ═══════════════════════════════════════════════════════════════════════════════

type TopicActual = "arquitectura" | "falha-rdp" | "falha-edp";

function TopicHeader({ cor, label, titulo, sub }: { cor: string; label: string; titulo: React.ReactNode; sub: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontFamily: "'Gloria Hallelujah', cursive", fontSize: 12, opacity: 0.65, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 40, lineHeight: 1 }}>{titulo}</div>
      <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 20, opacity: 0.55, marginTop: 6 }}>{sub}</div>
      <div style={{ height: 2, background: cor, opacity: 0.7, borderRadius: 2, margin: "14px 0", width: "45%" }} />
    </div>
  );
}

function ActualArquitectura() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 24, height: "calc(100vh - 172px)", overflow: "hidden" }}>

      {/* Main flow — flex column distribuído até ao fundo */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontFamily: "'Gloria Hallelujah', cursive", fontSize: 9, opacity: 0.55 }}>sistema actual · arquitectura</div>
            <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 26, lineHeight: 1.05 }}>
              Arquitectura <span style={{ color: C.navy }}>Actual</span>
            </div>
          </div>
          <div style={{ flex: 1, height: 2, background: C.navy, opacity: 0.2, borderRadius: 2 }} />
          {["ESXi · 1 server", "WinCC v7.5", "10 clientes", "5 VLANs"].map(t => (
            <span key={t} style={{ fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 10, padding: "2px 8px", border: `1.5px solid ${C.ink}`, borderRadius: 10, background: C.paper, flexShrink: 0 }}>{t}</span>
          ))}
        </div>

        {/* LAYER 1 — PLCs */}
        <div style={{ display: "flex", gap: 8 }}>
          {["ECLUSA 1","ECLUSA 2","ECLUSA 3","ECLUSA 4","ECLUSA 5"].map((lbl, i) => (
            <div key={lbl} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 6px", border: `2px solid ${C.ink}`, borderRadius: 10, background: C.paper, boxShadow: `2px 2px 0 ${C.ink}` }}>
              <img src="/icone_PLC.svg" alt="PLC" style={{ width: 56, height: 56, objectFit: "contain" }} />
              <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 14, lineHeight: 1 }}>PLC {i+1}</div>
              <div style={{ fontFamily: "'Gloria Hallelujah', cursive", fontSize: 8, opacity: 0.5, lineHeight: 1 }}>{lbl}</div>
              <span style={{ fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 9, padding: "1px 8px", border: `1px solid ${C.ink}`, borderRadius: 20, background: C.paper2 }}>~1 000 tags</span>
            </div>
          ))}
        </div>

        {/* Arrow 1 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ width: 1.5, height: 8, background: C.ink, opacity: 0.3 }} />
          <span style={{ fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 10, padding: "2px 16px", border: `1.5px solid ${C.ink}`, borderRadius: 20, background: C.paper, whiteSpace: "nowrap", boxShadow: `1px 1px 0 ${C.ink}` }}>IEC 104 · RTU → WinCC Server · 5 VLANs segmentadas</span>
          <div style={{ width: 1.5, height: 8, background: C.ink, opacity: 0.3 }} />
          <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: `8px solid ${C.ink}`, opacity: 0.4 }} />
        </div>

        {/* LAYER 2 — ESXi / WinCC Server */}
        <div style={{ border: `1.5px dashed ${C.ink}`, borderRadius: 10, padding: "5px 10px 7px", background: "rgba(33,46,62,0.025)" }}>
          <div style={{ fontFamily: "'Gloria Hallelujah', cursive", fontSize: 8, opacity: 0.35, textAlign: "center", marginBottom: 4 }}>VMware ESXi · servidor físico</div>
          <div style={{ border: `2px solid ${C.ink}`, borderRadius: 8, padding: "8px 14px", background: C.paper, boxShadow: `3px 3px 0 ${C.ink}`, display: "flex", gap: 12, alignItems: "center" }}>
            <img src="/icone_Wincc.png" alt="WinCC" style={{ width: 52, height: 52, objectFit: "contain", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 22, lineHeight: 1 }}>WinCC Server v7.5</div>
              <div style={{ fontFamily: "'Mulish', sans-serif", fontSize: 10, opacity: 0.55, margin: "2px 0 5px" }}>VM única · todo o projecto SCADA, tags e scripts</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {["5 canais IEC 104", "~5 000 tags", "Global Scripts", "10 licenças"].map(t => (
                  <span key={t} style={{ fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 10, padding: "1px 10px", border: `1.5px solid ${C.ink}`, borderRadius: 20, background: C.paper2 }}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Arrow 2 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ width: 1.5, height: 8, background: C.ink, opacity: 0.3 }} />
          <span style={{ fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 10, padding: "2px 16px", border: `1.5px solid ${C.ink}`, borderRadius: 20, background: C.paper, whiteSpace: "nowrap", boxShadow: `1px 1px 0 ${C.ink}` }}>NetDDE / DCOM · Windows NT (1995)</span>
          <div style={{ width: 1.5, height: 8, background: C.ink, opacity: 0.3 }} />
          <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: `8px solid ${C.ink}`, opacity: 0.4 }} />
        </div>

        {/* LAYER 3 — 10 WinCC Clients */}
        <div>
          <div style={{ fontFamily: "'Gloria Hallelujah', cursive", fontSize: 8, opacity: 0.35, textAlign: "center", marginBottom: 4 }}>10 WinCC Clients · VMs · sem projecto local · 100% dependentes do servidor</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "6px 8px" }}>
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "5px 2px", border: `1px solid rgba(0,0,0,0.1)`, borderRadius: 8, background: C.paper }}>
                <img src="/icone_Wincc.png" alt="WinCC" style={{ width: 42, height: 42, objectFit: "contain" }} />
                <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 13, lineHeight: 1 }}>Cliente {n}</div>
                <div style={{ fontFamily: "'Mulish', sans-serif", fontSize: 8, opacity: 0.4, lineHeight: 1 }}>sem projecto</div>
              </div>
            ))}
          </div>
        </div>

        {/* Arrow 3 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ width: 1.5, height: 8, background: C.ink, opacity: 0.3 }} />
          <span style={{ fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 10, padding: "2px 16px", border: `1.5px solid ${C.red}`, borderRadius: 20, background: C.paper, color: C.red, whiteSpace: "nowrap", boxShadow: `1px 1px 0 ${C.red}` }}>RDP · camada invisível ao WinCC</span>
          <div style={{ width: 1.5, height: 8, background: C.ink, opacity: 0.3 }} />
          <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: `8px solid ${C.ink}`, opacity: 0.4 }} />
        </div>

        {/* LAYER 4 — 5 Mesas */}
        <div>
          <div style={{ fontFamily: "'Gloria Hallelujah', cursive", fontSize: 8, opacity: 0.35, textAlign: "center", marginBottom: 4 }}>5 postos · 2 Mini PC · RDP → 2 clientes WinCC por mesa</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[1,2,3,4,5].map(n => (
              <div key={n} style={{ flex: 1, border: `2px solid ${C.ink}`, borderRadius: "12px 10px 14px 8px", padding: "7px 4px 6px", textAlign: "center", background: C.paper2, boxShadow: `3px 3px 0 ${C.ink}` }}>
                <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 17 }}>Mesa {n}</div>
                <div style={{ fontFamily: "'Mulish', sans-serif", fontSize: 9, opacity: 0.45, marginTop: 1 }}>2 Mini PC</div>
                <div style={{ marginTop: 4, border: `1px solid ${C.ink}`, borderRadius: 20, padding: "1px 6px", background: C.paper, display: "inline-block" }}>
                  <span style={{ fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 10 }}>C{n*2-1}+C{n*2}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Riscos */}
        <div style={{ borderTop: `1.5px dashed ${C.ink}`, paddingTop: 8 }}>
          <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 15, marginBottom: 5 }}>Riscos desta arquitectura</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px 14px" }}>
            {[
              { n: "1", t: "Ponto único de falha — 1 VM afecta 10 postos" },
              { n: "2", t: "10 clientes simultâneos fora do dimensionamento" },
              { n: "3", t: "Race conditions nos Global Scripts partilhados" },
              { n: "4", t: "5 VLANs com latências díspares → inconsistências" },
              { n: "5", t: "NetDDE/DCOM sem reconexão fiável (1995)" },
              { n: "6", t: "Sem log de sessões nem gestão de acessos" },
            ].map(({ n, t }) => (
              <div key={n} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <div style={{ width: 17, height: 17, border: `1.5px solid ${C.ink}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 10, flexShrink: 0, opacity: 0.55 }}>{n}</div>
                <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 11, lineHeight: 1.3, margin: 0, opacity: 0.75 }}>{t}</p>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Aside direito */}
      <Aside titulo="Arquitectura" pontos={[
        { label: "ESXi:", text: "1 servidor físico com todas as VMs" },
        { label: "WinCC Server:", text: "1 VM com todo o projecto SCADA" },
        { label: "10 Clientes:", text: "sem projecto próprio — 100% dependentes" },
        { label: "NetDDE/DCOM:", text: "protocolo Windows NT, anos 90" },
        { label: "Global Scripts:", text: "ciclo único partilhado por todos" },
        { label: "5 VLANs:", text: "uma por sistema de eclusas" },
      ]} pills={["ESXi", "WinCC Server", "NetDDE", "VLANs"]} />

    </div>
  );
}

function ActualFalhaRDP() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 36, alignItems: "start" }}>
      <div>
        <TopicHeader cor={C.red} label="sistema actual · tópico" titulo={<>Falha <span style={{ color: C.red }}>RDP</span></>} sub="o que acontece quando a sessão cai" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
          <div>
            <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>Quando a sessão RDP cai, o WinCC <b>não é notificado</b>. O servidor continua a tratar aquele posto como activo.</p>
            <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>Se um operador der uma <b>ordem de telecomando</b> imediatamente antes de a ligação cair, essa ordem <span style={{ color: C.red, fontWeight: 700 }}>pode nunca chegar à eclusa</span> — e o sistema não saberá que falhou.</p>
            <AlertBox color={C.red}><b>Cenário crítico:</b> Operador envia telecomando → RDP cai → WinCC Server processa mas a resposta nunca chega → eclusa pode não executar → <b>nenhum alerta é gerado</b>.</AlertBox>
          </div>
          <div style={{ border: `2.5px solid ${C.ink}`, borderRadius: "18px 14px 16px 20px", background: C.paper, boxShadow: `5px 5px 0 ${C.ink}`, padding: 20 }}>
            <div style={{ fontFamily: "'Gloria Hallelujah', cursive", fontSize: 11, opacity: 0.65, marginBottom: 14 }}>diagrama · sequência de falha RDP</div>
            <div style={{ display: "flex", alignItems: "center", overflowX: "auto" }}>
              <div style={{ textAlign: "center", minWidth: 100 }}>
                <div style={{ border: `2px solid ${C.ink}`, borderRadius: 8, padding: "8px 10px", background: C.paper2 }}>
                  <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 15 }}>Mini PC</div>
                  <div style={{ fontFamily: "'Gloria Hallelujah', cursive", fontSize: 10, opacity: 0.65 }}>Operador</div>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 80, textAlign: "center" }}>
                <svg width="100%" height="40" viewBox="0 0 100 40" preserveAspectRatio="none">
                  <line x1="0" y1="20" x2="35" y2="20" stroke={C.ink} strokeWidth="2" strokeDasharray="4 3"/>
                  <text x="50" y="26" textAnchor="middle" fontFamily="Caveat, cursive" fontSize="20" fontWeight="900" fill={C.red}>X</text>
                  <line x1="65" y1="20" x2="100" y2="20" stroke={C.ink} strokeWidth="2" strokeDasharray="4 3"/>
                </svg>
                <div style={{ fontFamily: "'Gloria Hallelujah', cursive", fontSize: 9, color: C.red, opacity: 1, marginTop: -6 }}>RDP interrompido</div>
              </div>
              <div style={{ textAlign: "center", minWidth: 100 }}>
                <div style={{ border: `2px solid ${C.ink}`, borderRadius: 8, padding: "8px 10px", background: C.paper2 }}>
                  <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 15 }}>WinCC Client</div>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 40, textAlign: "center" }}>
                <svg width="100%" height="40" viewBox="0 0 60 40" preserveAspectRatio="none">
                  <line x1="0" y1="20" x2="50" y2="20" stroke={C.ink} strokeWidth="2"/>
                  <polygon points="50,14 60,20 50,26" fill={C.ink}/>
                </svg>
              </div>
              <div style={{ textAlign: "center", minWidth: 100 }}>
                <div style={{ border: `2px solid ${C.accent}`, borderRadius: 8, padding: "8px 10px", background: C.accent + "30" }}>
                  <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 15 }}>WinCC Server</div>
                  <div style={{ fontFamily: "'Gloria Hallelujah', cursive", fontSize: 9, opacity: 0.65 }}>continua activo</div>
                </div>
              </div>
            </div>
            <div style={{ height: 12, margin: "14px 0", backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 14'><path d='M0 7 L 8 3 L 16 9 L 24 4 L 32 8 L 40 3 L 48 9 L 56 5 L 64 8 L 72 3 L 80 9 L 88 4 L 96 8 L 104 3 L 112 9 L 120 4 L 128 8 L 136 3 L 144 9 L 152 5 L 160 8 L 168 3 L 176 9 L 184 4 L 192 8 L 200 5' stroke='%231a1a1a' stroke-width='1.5' fill='none'/></svg>")`, backgroundRepeat: "repeat-x", opacity: 0.35 }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "Ecrã do operador", text: "congelado ou desligado", color: C.red },
                { label: "WinCC Server", text: "continua — não detecta nada", color: C.accent },
                { label: "Sistema", text: "não detecta. Não alerta.", color: C.red },
              ].map(({ label, text, color }) => (
                <div key={label} style={{ border: `2px solid ${color}`, borderRadius: 8, padding: 10, background: color + "10" }}>
                  <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 14 }}>{label}</div>
                  <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ height: 14, margin: "24px 0", backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 14'><path d='M0 7 L 8 3 L 16 9 L 24 4 L 32 8 L 40 3 L 48 9 L 56 5 L 64 8 L 72 3 L 80 9 L 88 4 L 96 8 L 104 3 L 112 9 L 120 4 L 128 8 L 136 3 L 144 9 L 152 5 L 160 8 L 168 3 L 176 9 L 184 4 L 192 8 L 200 5' stroke='%231a1a1a' stroke-width='1.5' fill='none'/></svg>")`, backgroundRepeat: "repeat-x", opacity: 0.35 }} />

        <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 22, marginBottom: 14 }}>Outras consequências da invisibilidade do RDP</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
          {[
            { titulo: "Sem controlo de quem abre a sessão", texto: "Qualquer pessoa com acesso à rede pode estabelecer uma sessão RDP. O WinCC não distingue um operador autorizado de uma ligação não autorizada." },
            { titulo: "Sem interlocking real", texto: "Dois postos podem aceder à mesma eclusa em simultâneo. O WinCC não tem forma de impedir conflitos de telecomando de sessões RDP diferentes." },
            { titulo: "Supervisão sem garantias", texto: "O posto de supervisão depende de uma sessão RDP própria. Se cair, o supervisor perde visibilidade — sem qualquer alerta." },
            { titulo: "Sem registo de sessões", texto: "Não existe histórico de quando cada sessão foi estabelecida, quem a iniciou, ou quando terminou. Zero rastreabilidade em incidentes." },
          ].map(({ titulo, texto }) => (
            <div key={titulo} style={{ border: `2px solid ${C.red}`, borderRadius: "10px 14px 8px 12px", padding: 16, background: C.paper }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ width: 28, height: 28, border: `2.5px solid ${C.red}`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: C.red, fontFamily: "'Caveat', cursive", fontWeight: 900, fontSize: 20, flexShrink: 0 }}>X</div>
                <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 20, color: C.red, lineHeight: 1 }}>{titulo}</div>
              </div>
              <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 14, lineHeight: 1.55 }}>{texto}</p>
            </div>
          ))}
        </div>

        <div style={{ border: `3px solid ${C.ink}`, borderRadius: "16px 20px 14px 18px", padding: 24, background: C.navy, color: "white", boxShadow: `6px 6px 0 ${C.ink}` }}>
          <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 26, color: "white", marginBottom: 10 }}>Resumo do diagnóstico</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {["O WinCC não monitoriza o estado das sessões RDP","Não há controlo de acesso à camada de ligação remota","Conflitos de telecomando são possíveis e não detectados","Perda de supervisão sem alerta ao operador ou sistema","Zero rastreabilidade em caso de incidente","A segurança operacional depende de procedimentos manuais"].map(t => <Cross key={t} text={t} />)}
          </div>
        </div>
      </div>
      <Aside titulo="Falha RDP" pontos={[
        { label: "Invisível:", text: "WinCC não sabe quando a sessão cai" },
        { label: "Sem alerta:", text: "operador e supervisor sem notificação" },
        { label: "Telecomando em risco:", text: "ordem pode não chegar à eclusa" },
        { label: "Sem interlocking:", text: "dois postos na mesma eclusa em simultâneo" },
        { label: "Zero rastreabilidade:", text: "não há log de sessões" },
      ]} pills={["RDP invisível", "sem alerta", "telecomando", "interlocking"]} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SISTEMA PROPOSTO
// ═══════════════════════════════════════════════════════════════════════════════

type TopicProposto = "arquitectura" | "resumo" | "simulacao";

function PropostoArquitectura() {
  const eclusas = [
    { id: "CL", nome: "Crestuma",   plc: "PLC 1" },
    { id: "CM", nome: "Carrapatelo",plc: "PLC 2" },
    { id: "PN", nome: "Pocinho",    plc: "PLC 3" },
    { id: "RG", nome: "Régua",      plc: "PLC 4" },
    { id: "VR", nome: "Valeira",    plc: "PLC 5" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 24, height: "calc(100vh - 172px)", overflow: "hidden" }}>

      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontFamily: "'Gloria Hallelujah', cursive", fontSize: 9, opacity: 0.55 }}>sistema proposto · arquitectura</div>
            <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 26, lineHeight: 1.05 }}>
              Arquitectura <span style={{ color: C.navy }}>Proposta</span>
            </div>
          </div>
          <div style={{ flex: 1, height: 2, background: C.ink, opacity: 0.15, borderRadius: 2 }} />
          {["ESXi mantido", "5 WinCC independentes", "5 mesas", "Rust API"].map(t => (
            <span key={t} style={{ fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 10, padding: "2px 8px", border: `1.5px solid ${C.ink}`, borderRadius: 10, background: C.paper2, color: C.ink, flexShrink: 0 }}>{t}</span>
          ))}
        </div>

        {/* LAYER 1 — 5 PLCs com ligação directa */}
        <div style={{ display: "flex", gap: 8 }}>
          {eclusas.map((e) => (
            <div key={e.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 6px", border: `2px solid ${C.ink}`, borderRadius: 10, background: C.paper, boxShadow: `2px 2px 0 ${C.ink}` }}>
              <img src="/icone_PLC.svg" alt="PLC" style={{ width: 56, height: 56, objectFit: "contain" }} />
              <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 14, lineHeight: 1 }}>{e.plc}</div>
              <div style={{ fontFamily: "'Gloria Hallelujah', cursive", fontSize: 8, opacity: 0.5, lineHeight: 1 }}>{e.id} · {e.nome}</div>
              <span style={{ fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 9, padding: "1px 8px", border: `1.5px solid ${C.ink}`, borderRadius: 20, background: C.paper2, color: C.ink }}>~1 000 tags</span>
            </div>
          ))}
        </div>

        {/* Arrow 1 — IEC 104 directo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ width: 1.5, height: 8, background: C.ink, opacity: 0.4 }} />
          <span style={{ fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 10, padding: "2px 16px", border: `1.5px solid ${C.ink}`, borderRadius: 20, background: C.paper, color: C.ink, whiteSpace: "nowrap", boxShadow: `1px 1px 0 ${C.ink}` }}>IEC 104 · RTU → WinCC dedicado · ligação directa por eclusa</span>
          <div style={{ width: 1.5, height: 8, background: C.ink, opacity: 0.4 }} />
          <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: `8px solid ${C.ink}`, opacity: 0.5 }} />
        </div>

        {/* LAYER 2 — ESXi + 5 WinCC independentes */}
        <div style={{ border: `1.5px dashed ${C.ink}`, borderRadius: 10, padding: "5px 10px 7px", background: C.paper2 }}>
          <div style={{ fontFamily: "'Gloria Hallelujah', cursive", fontSize: 8, opacity: 0.45, textAlign: "center", marginBottom: 4, color: C.ink }}>VMware ESXi · servidor físico · 5 WinCC independentes (antes: 1 servidor + 10 clientes)</div>
          <div style={{ display: "flex", gap: 8 }}>
            {eclusas.map(e => (
              <div key={e.id} style={{ flex: 1, border: `2px solid ${C.ink}`, borderRadius: 8, padding: "7px 4px", background: C.paper, boxShadow: `2px 2px 0 ${C.ink}`, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <img src="/icone_Wincc.png" alt="WinCC" style={{ width: 44, height: 44, objectFit: "contain" }} />
                <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 13, lineHeight: 1, color: C.navy }}>WinCC {e.id}</div>
                <div style={{ fontFamily: "'Mulish', sans-serif", fontSize: 8, opacity: 0.5, lineHeight: 1, textAlign: "center" }}>server + client</div>
                <div style={{ fontFamily: "'Gloria Hallelujah', cursive", fontSize: 7.5, opacity: 0.45, lineHeight: 1 }}>{e.nome}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Arrow 2 — wincc-api (Rust) */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ width: 1.5, height: 8, background: C.ink, opacity: 0.3 }} />
          <span style={{ fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 10, padding: "2px 16px", border: `2px solid ${C.navy}`, borderRadius: 20, background: C.navy, color: "white", whiteSpace: "nowrap", boxShadow: `2px 2px 0 ${C.ink}` }}>wincc-api (Rust/Axum) · Gestão de Acessos RDP · Auditoria · Streaming</span>
          <div style={{ width: 1.5, height: 8, background: C.ink, opacity: 0.3 }} />
          <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: `8px solid ${C.ink}`, opacity: 0.4 }} />
        </div>

        {/* LAYER 3 — wincc-api funcionalidades */}
        <div style={{ border: `2px solid ${C.navy}`, borderRadius: 10, padding: "7px 12px", background: C.navy + "08", display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "4px 8px" }}>
          {[
            { emoji: "🔐", t: "Autenticação por operador em cada sessão RDP" },
            { emoji: "🔒", t: "Interlocking — 1 operador por eclusa de cada vez" },
            { emoji: "📡", t: "Streaming de ecrã via eclusa-streamer (Rust)" },
            { emoji: "📋", t: "Auditoria completa · SQLite · histórico de sessões" },
            { emoji: "👁", t: "Shadow view para supervisão sem intervenção" },
          ].map(({ emoji, t }) => (
            <div key={t} style={{ display: "flex", gap: 5, alignItems: "flex-start", padding: "3px 4px" }}>
              <span style={{ fontSize: 12, flexShrink: 0 }}>{emoji}</span>
              <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 10, lineHeight: 1.3, margin: 0, opacity: 0.8 }}>{t}</p>
            </div>
          ))}
        </div>

        {/* Arrow 3 — RDP gerido */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ width: 1.5, height: 8, background: C.ink, opacity: 0.3 }} />
          <span style={{ fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 10, padding: "2px 16px", border: `1.5px solid ${C.green}`, borderRadius: 20, background: C.paper, color: C.green, whiteSpace: "nowrap", boxShadow: `1px 1px 0 ${C.green}` }}>RDP gerido · sessão autenticada · interlocking activo</span>
          <div style={{ width: 1.5, height: 8, background: C.ink, opacity: 0.3 }} />
          <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: `8px solid ${C.ink}`, opacity: 0.4 }} />
        </div>

        {/* LAYER 4 — 5 Mesas (1 Mini PC cada) */}
        <div>
          <div style={{ fontFamily: "'Gloria Hallelujah', cursive", fontSize: 8, opacity: 0.35, textAlign: "center", marginBottom: 4 }}>5 postos · 1 Mini PC por mesa · cada posto ligado à sua eclusa dedicada</div>
          <div style={{ display: "flex", gap: 8 }}>
            {eclusas.map((e, n) => (
              <div key={e.id} style={{ flex: 1, border: `2px solid ${C.green}`, borderRadius: "12px 10px 14px 8px", padding: "7px 4px 6px", textAlign: "center", background: C.green + "10", boxShadow: `3px 3px 0 ${C.green}` }}>
                <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 17, color: C.green }}>Mesa {n+1}</div>
                <div style={{ fontFamily: "'Mulish', sans-serif", fontSize: 9, opacity: 0.55, marginTop: 1 }}>1 Mini PC</div>
                <div style={{ marginTop: 4, border: `1px solid ${C.green}`, borderRadius: 20, padding: "1px 6px", background: C.paper, display: "inline-block" }}>
                  <span style={{ fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 10, color: C.green }}>WinCC {e.id}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ganhos */}
        <div style={{ borderTop: `1.5px dashed ${C.green}`, paddingTop: 8 }}>
          <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 15, color: C.green, marginBottom: 5 }}>Ganhos desta arquitectura</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px 14px" }}>
            {[
              { n: "✓", t: "Sem ponto único de falha — cada eclusa é independente" },
              { n: "✓", t: "IEC 104 directo → sem latências díspares entre VLANs" },
              { n: "✓", t: "Sem NetDDE/DCOM — protocolo moderno e fiável" },
              { n: "✓", t: "Scripts WinCC isolados por eclusa — sem race conditions" },
              { n: "✓", t: "Interlocking e auditoria completa via wincc-api" },
              { n: "✓", t: "De 11 VMs para 5 — menos licenças, mais performance" },
            ].map(({ n, t }) => (
              <div key={t} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <div style={{ width: 17, height: 17, border: `1.5px solid ${C.green}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 12, flexShrink: 0, color: C.green }}>{n}</div>
                <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 11, lineHeight: 1.3, margin: 0, opacity: 0.8 }}>{t}</p>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Aside */}
      <Aside titulo="Proposta" pontos={[
        { label: "ESXi:", text: "mantido — mesmo servidor físico" },
        { label: "5 WinCC:", text: "um por eclusa, server+client numa só VM" },
        { label: "IEC 104:", text: "ligação directa PLC → WinCC dedicado" },
        { label: "Rust API:", text: "wincc-api gere acessos RDP, audit, streaming" },
        { label: "5 Mesas:", text: "1 Mini PC cada — posto dedicado à eclusa" },
        { label: "Ganho:", text: "de 11 VMs para 5 · sem NetDDE · sem concorrência" },
      ]} pills={["ESXi", "5 WinCC", "Rust API", "IEC 104"]} />

    </div>
  );
}

function PropostoResumo() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 36, alignItems: "start" }}>
      <div>
        <TopicHeader cor={C.green} label="sistema proposto · tópico" titulo={<>Resumo dos <span style={{ color: C.green }}>Ganhos</span></>} sub="o que o EDP Acessos resolve" />

        <div style={{ border: `3px solid ${C.ink}`, borderRadius: "16px 20px 14px 18px", padding: 28, background: C.navy, color: "white", boxShadow: `6px 6px 0 ${C.ink}`, marginBottom: 24 }}>
          <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 30, color: "white", marginBottom: 16 }}>O que o EDP Acessos resolve</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              "Autenticação obrigatória — sem registo no sistema não há acesso RDP",
              "Passwords com hash SHA-256 — nunca armazenadas em texto claro",
              "Dois níveis: utilizadores de gestão (admin) e operadores por eclusa",
              "Acesso não autorizado: desconexão imediata + IP bloqueado no firewall",
              "IP desbloqueado automaticamente quando sessão autorizada é iniciada",
              "O mesmo operador bloqueado se já tiver sessão activa noutro posto",
              "Interlocking real: 1 operador por eclusa, conflito tecnicamente impossível",
              "Shadow View directo ao Windows Server 2022 — sem VMs de supervisão adicionais",
              "WinCC escreve estado SCADA directamente na API via HTTP — painel unificado",
              "Auditoria SQLite + SSE em tempo real — rastreabilidade total",
              "Eliminação do DCOM/NetDDE — protocolo legado removido da arquitectura",
              "Scripts isolados por VM: sem concorrência de execução entre eclusas",
            ].map(t => <Check key={t} text={t} />)}
          </div>
        </div>

        <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 22, marginBottom: 14 }}>Antes e depois — comparação completa</div>
        {(() => {
          const pares: [string, string][] = [
            ["Qualquer utilizador acede via RDP sem qualquer validação", "Autenticação obrigatória — sem registo no sistema, sem acesso"],
            ["Credenciais em texto claro — sem gestão de utilizadores", "Passwords com hash SHA-256 — nunca armazenadas em texto claro"],
            ["Sem distinção entre administrador e operador", "Dois níveis de acesso: administradores e operadores por eclusa"],
            ["Acesso não autorizado passa despercebido — sem resposta", "Desconexão imediata e IP adicionado automaticamente à lista negra"],
            ["IP bloqueado permanece bloqueado indefinidamente", "IP desbloqueado de forma automática quando uma sessão válida é iniciada"],
            ["Sem interlocking — dois postos podem controlar a mesma eclusa", "Interlocking real: um operador por eclusa, conflito tecnicamente impossível"],
            ["O mesmo operador pode abrir sessões simultâneas em vários postos", "Operador bloqueado se já tiver uma sessão activa noutro posto"],
            ["1 WinCC Server centralizado gere 5 PLCs via VLANs partilhadas", "1 WinCC por eclusa com IEC 104 directo ao seu PLC — sem VLANs partilhadas"],
            ["DCOM/NetDDE distribui imagens e dados por toda a rede corporativa", "Eliminação total do DCOM — cada VM corre o seu projecto WinCC de forma autónoma"],
            ["WinCC sem visibilidade centralizada do estado operacional das eclusas", "WinCC escreve o estado SCADA (LIVRE / OPERAÇÃO / TELECOMANDO) directamente na API"],
            ["Supervisão remota exige VMs WinCC Client adicionais", "Shadow View directo ao Windows Server 2022 — sem VMs de supervisão adicionais"],
            ["Zero rastreabilidade — nenhum registo de acessos ou eventos", "Auditoria completa em SQLite com alertas SSE em tempo real no painel de gestão"],
          ];
          return (
            <div style={{ display: "flex", border: `2.5px solid ${C.ink}`, borderRadius: 12, overflow: "hidden", boxShadow: `4px 4px 0 ${C.ink}` }}>
              {/* COLUNA ESQUERDA — Actual / vermelho */}
              <div style={{ flex: 1, borderRight: `2px solid ${C.ink}` }}>
                <div style={{ background: C.red, padding: "10px 16px" }}>
                  <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 18, color: "white" }}>Actual — Centralizado</div>
                </div>
                {pares.map(([atual], i) => (
                  <div key={i} style={{ padding: "8px 14px", borderTop: `1.5px solid ${C.ink}`, background: i % 2 === 0 ? C.paper : C.paper2 }}>
                    <span style={{ fontFamily: "'Mulish', sans-serif", fontSize: 13, color: C.red }}>✗ {atual}</span>
                  </div>
                ))}
              </div>
              {/* COLUNA DIREITA — Proposto / verde */}
              <div style={{ flex: 1 }}>
                <div style={{ background: C.green, padding: "10px 16px" }}>
                  <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 18, color: "white" }}>Proposto — EDP Acessos</div>
                </div>
                {pares.map(([, proposto], i) => (
                  <div key={i} style={{ padding: "8px 14px", borderTop: `1.5px solid ${C.ink}`, background: i % 2 === 0 ? C.paper : C.paper2 }}>
                    <span style={{ fontFamily: "'Mulish', sans-serif", fontSize: 13, color: C.green }}>✓ {proposto}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
      <Aside titulo="Ganhos totais" pontos={[
        { label: "SHA-256:", text: "passwords com hash — nunca em texto claro" },
        { label: "2 níveis:", text: "admin (utilizadores) + operadores por eclusa" },
        { label: "Blacklist:", text: "IP bloqueado/desbloqueado automaticamente" },
        { label: "Sem DCOM:", text: "protocolo legado eliminado da arquitectura" },
        { label: "1 WinCC : 1 PLC:", text: "IEC 104 directo, sem VLANs partilhadas" },
        { label: "SCADA API:", text: "WinCC escreve estado directamente na API" },
        { label: "Shadow View:", text: "directo ao Windows Server 2022, sem VMs" },
        { label: "Auditoria:", text: "SQLite + SSE — rastreabilidade total" },
      ]} pills={["SHA-256", "blacklist", "sem DCOM", "1:1 PLC", "shadow view"]} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIMULAÇÃO INTERACTIVA
// ═══════════════════════════════════════════════════════════════════════════════

function PropostoSimulacao() {
  const [leftSteps,   setLeftSteps]   = useState<{ text: string; color: string }[]>([]);
  const [leftRunning, setLeftRunning] = useState(false);
  const [rightSteps,  setRightSteps]  = useState<{ text: string; color: string }[]>([]);
  const [rightRunning,setRightRunning]= useState(false);
  const [scenario,    setScenario]    = useState<"none" | "unauth" | "auth">("none");
  const [username,    setUsername]    = useState("op_eclusa3");
  const [password,    setPassword]    = useState("Seg2026!");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  function clearTimers() { timers.current.forEach(clearTimeout); timers.current = []; }

  function animate(
    setter: React.Dispatch<React.SetStateAction<{ text: string; color: string }[]>>,
    steps: { text: string; color: string }[],
    onDone: () => void,
  ) {
    steps.forEach((s, i) => {
      const t = setTimeout(() => {
        setter(prev => [...prev, s]);
        if (i === steps.length - 1) onDone();
      }, (i + 1) * 700);
      timers.current.push(t);
    });
  }

  function runLeft() {
    if (leftRunning) return;
    clearTimers();
    setLeftSteps([]);
    setLeftRunning(true);
    animate(setLeftSteps, [
      { text: "Pedido de sessão RDP recebido de 172.29.164.54...", color: C.ink },
      { text: "Verificação de credenciais... (nenhuma exigida)", color: C.muted },
      { text: "✓ Sem validação — acesso imediato concedido", color: C.red },
      { text: "Sessão RDP estabelecida — Windows Server 2022", color: C.red },
      { text: "⚠  Outro operador já activo na Eclusa 3 — conflito não detectado", color: C.red },
      { text: "⚠  Nenhum registo de acesso — rastreabilidade zero", color: C.red },
    ], () => setLeftRunning(false));
  }

  function runUnauth() {
    if (rightRunning) return;
    clearTimers();
    setRightSteps([]);
    setRightRunning(true);
    setScenario("unauth");
    animate(setRightSteps, [
      { text: "Pedido de acesso recebido de 172.29.164.54...", color: C.ink },
      { text: "A verificar identidade na base de dados SQLite...", color: C.ink },
      { text: "✗ Utilizador não registado no sistema", color: C.red },
      { text: "Forçar desconexão imediata via tsdiscon...", color: C.red },
      { text: "PowerShell: New-NetFirewallRule → IP 172.29.164.54 bloqueado", color: C.red },
      { text: "⛔ IP adicionado à lista negra do firewall", color: C.red },
      { text: "Evento registado em auditoria SQLite", color: C.muted },
      { text: "Alerta SSE emitido para o painel de gestão", color: C.muted },
    ], () => setRightRunning(false));
  }

  function runAuth() {
    if (rightRunning) return;
    clearTimers();
    setRightSteps([]);
    setRightRunning(true);
    setScenario("auth");
    const u = username.trim() || "op_eclusa3";
    animate(setRightSteps, [
      { text: `Pedido de autenticação: utilizador "${u}"`, color: C.ink },
      { text: "A calcular SHA-256(username:password)...", color: C.ink },
      { text: "✓ Hash verificado — credenciais válidas", color: C.green },
      { text: "A verificar sessões activas para este operador...", color: C.ink },
      { text: "✓ Sem sessão activa noutro posto — sem conflito de duplicado", color: C.green },
      { text: "A verificar interlocking — Eclusa 3 disponível?", color: C.ink },
      { text: "✓ Eclusa 3 livre — nenhum operador atribuído", color: C.green },
      { text: "IP 172.29.164.54 removido da lista negra do firewall", color: C.green },
      { text: `✅ Sessão RDP autorizada — Eclusa 3 atribuída a "${u}"`, color: C.green },
      { text: "Estado SCADA → OPERAÇÃO_LOCAL enviado à API via HTTP POST", color: C.blue },
      { text: "Evento registado em SQLite + alerta SSE emitido em tempo real", color: C.muted },
    ], () => setRightRunning(false));
  }

  function resetAll() {
    clearTimers();
    setLeftSteps([]); setRightSteps([]);
    setLeftRunning(false); setRightRunning(false);
    setScenario("none");
  }

  const rightDone = !rightRunning && rightSteps.length > 0;
  const rightBg   = rightDone ? (scenario === "unauth" ? `${C.red}0D` : `${C.green}0D`) : "white";

  const logRow = (s: { text: string; color: string }, i: number) => (
    <div key={i} style={{ color: s.color, marginBottom: 7, display: "flex", gap: 8, alignItems: "flex-start" }}>
      <span style={{ color: C.muted, flexShrink: 0, fontSize: 11, fontFamily: "monospace" }}>{String(i + 1).padStart(2, "0")}</span>
      <span style={{ fontFamily: "monospace", fontSize: 12.5 }}>{s.text}</span>
    </div>
  );

  const btnBase: React.CSSProperties = {
    fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 14,
    border: `2px solid ${C.ink}`, padding: "8px 20px",
    borderRadius: "10px 8px 12px 8px", boxShadow: `2px 2px 0 ${C.ink}`,
    cursor: "pointer", color: "white", transition: "opacity .15s",
  };

  return (
    <div>
      <TopicHeader cor={C.blue} label="Sistema Proposto · EDP Acessos" titulo="Simulação Interactiva" sub="Demonstração passo a passo — sistema actual vs. EDP Acessos" />

      <div style={{ display: "flex", border: `2.5px solid ${C.ink}`, borderRadius: 14, overflow: "hidden", boxShadow: `4px 4px 0 ${C.ink}` }}>

        {/* ── Esquerda: sistema actual ──────────────────────────────── */}
        <div style={{ flex: 1, borderRight: `2px solid ${C.ink}`, display: "flex", flexDirection: "column" }}>
          <div style={{ background: C.red, padding: "12px 18px" }}>
            <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 18, color: "white" }}>Sistema Actual — Sem Autenticação</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.75)", marginTop: 2 }}>RDP directo ao servidor · sem validação · sem registo</div>
          </div>
          <div style={{ padding: "12px 16px", borderBottom: `1.5px dashed ${C.ink}`, background: C.paper2 }}>
            <button
              onClick={runLeft}
              disabled={leftRunning}
              style={{ ...btnBase, background: leftRunning ? C.muted : C.red, cursor: leftRunning ? "not-allowed" : "pointer" }}
            >
              {leftRunning ? "A simular..." : "▶  Aceder via RDP (sem credenciais)"}
            </button>
          </div>
          <div style={{ flex: 1, padding: "14px 16px", minHeight: 290, background: leftSteps.length > 0 ? `${C.red}09` : "white", transition: "background .3s" }}>
            {leftSteps.length === 0
              ? <div style={{ color: C.muted, fontFamily: "'Mulish', sans-serif", fontSize: 13 }}>Clique em "Aceder via RDP" para iniciar a simulação.</div>
              : leftSteps.map(logRow)}
          </div>
        </div>

        {/* ── Direita: EDP Acessos ──────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ background: C.navy, padding: "12px 18px" }}>
            <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 18, color: "white" }}>EDP Acessos — Com Autenticação</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.65)", marginTop: 2 }}>SHA-256 · interlocking · blacklist · auditoria SQLite</div>
          </div>
          <div style={{ padding: "12px 16px", borderBottom: `1.5px dashed ${C.ink}`, background: C.paper2, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Utilizador"
                style={{ fontFamily: "'Mulish', sans-serif", fontSize: 13, border: `1.5px solid ${C.ink}`, borderRadius: 6, padding: "5px 10px", flex: 1, background: "white" }}
              />
              <input
                value={password}
                onChange={e => setPassword(e.target.value)}
                type="password"
                placeholder="Password"
                style={{ fontFamily: "'Mulish', sans-serif", fontSize: 13, border: `1.5px solid ${C.ink}`, borderRadius: 6, padding: "5px 10px", flex: 1, background: "white" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={runUnauth}
                disabled={rightRunning}
                style={{ ...btnBase, flex: 1, fontSize: 13, padding: "7px 10px", background: rightRunning ? C.muted : C.red, cursor: rightRunning ? "not-allowed" : "pointer" }}
              >✗  Sem credenciais válidas</button>
              <button
                onClick={runAuth}
                disabled={rightRunning}
                style={{ ...btnBase, flex: 1, fontSize: 13, padding: "7px 10px", background: rightRunning ? C.muted : C.green, cursor: rightRunning ? "not-allowed" : "pointer" }}
              >✓  Credenciais válidas</button>
            </div>
          </div>
          <div style={{ flex: 1, padding: "14px 16px", minHeight: 290, background: rightBg, transition: "background .3s" }}>
            {rightSteps.length === 0
              ? <div style={{ color: C.muted, fontFamily: "'Mulish', sans-serif", fontSize: 13 }}>Escolha um cenário acima para iniciar a simulação.</div>
              : rightSteps.map(logRow)}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={resetAll}
          style={{ fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 13, background: C.paper, color: C.ink, border: `1.5px solid ${C.ink}`, padding: "6px 18px", borderRadius: "10px 8px 12px 8px", cursor: "pointer", boxShadow: `2px 2px 0 ${C.ink}` }}
        >↺  Repor simulação</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

type TabMain = "actual" | "proposto";

const TOPICS_ACTUAL: { id: TopicActual; label: string }[] = [
  { id: "arquitectura",  label: "Arquitectura" },
  { id: "falha-rdp",    label: "Falha RDP" },
  { id: "falha-edp",    label: "Rede & Latência" },
];

const TOPICS_PROPOSTO: { id: TopicProposto; label: string }[] = [
  { id: "arquitectura", label: "Arquitectura" },
  { id: "resumo",       label: "Resumo & Ganhos" },
  { id: "simulacao",    label: "Simulação" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MODO PDF — todos os slides empilhados (um por página)
// ═══════════════════════════════════════════════════════════════════════════════

export function ApresentacaoPDF() {
  const fonts = (
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;600;700&family=Kalam:wght@400;700&family=Gloria+Hallelujah&family=Mulish:wght@400;600;700&display=swap"
    />
  );

  const bg: React.CSSProperties = {
    background: C.paper,
    backgroundImage:
      "radial-gradient(rgba(0,0,0,.04) 1px, transparent 1px), radial-gradient(rgba(0,0,0,.03) 1px, transparent 1px)",
    backgroundSize: "24px 24px, 24px 24px",
    backgroundPosition: "0 0, 12px 12px",
  };

  function PageBanner({ title, sub, color }: { title: string; sub: string; color: string }) {
    return (
      <div style={{
        background: color, padding: "10px 40px",
        display: "flex", alignItems: "baseline", gap: 16,
        borderBottom: `2px solid ${C.ink}`,
      }}>
        <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 26, color: "white", lineHeight: 1 }}>{title}</div>
        <div style={{ fontFamily: "'Gloria Hallelujah', cursive", fontSize: 10, color: "rgba(255,255,255,.8)" }}>{sub}</div>
        <div style={{ marginLeft: "auto", fontFamily: "'Kalam', cursive", fontSize: 11, color: "rgba(255,255,255,.65)" }}>EDP Acessos · Controlo de Sessões RDP</div>
      </div>
    );
  }

  // Slides de arquitectura têm height:calc(100vh-172px) internamente →
  // reduzimos o banner + padding para que o calc() não ultrapasse 100vh
  const fixedSlide: React.CSSProperties = {
    ...bg,
    height: "100vh",
    overflow: "hidden",
    pageBreakAfter: "always",
    breakAfter: "page",
    display: "flex",
    flexDirection: "column",
    fontFamily: "'Mulish', system-ui, sans-serif",
    color: C.ink,
  };

  const scrollSlide: React.CSSProperties = {
    ...bg,
    minHeight: "100vh",
    pageBreakAfter: "always",
    breakAfter: "page",
    display: "flex",
    flexDirection: "column",
    fontFamily: "'Mulish', system-ui, sans-serif",
    color: C.ink,
  };

  return (
    <div>
      {fonts}

      {/* ── 1. Sistema Actual — Arquitectura ─────────────────────────── */}
      <div style={fixedSlide}>
        <PageBanner title="Sistema Actual — Arquitectura" sub="estado actual · visão geral" color={C.navy} />
        <div style={{ flex: 1, padding: "12px 40px 12px", overflow: "hidden" }}>
          <ActualArquitectura />
        </div>
      </div>

      {/* ── 2. Sistema Actual — Falha RDP ────────────────────────────── */}
      <div style={scrollSlide}>
        <PageBanner title="Sistema Actual — Falha RDP" sub="riscos e diagnóstico" color={C.red} />
        <div style={{ flex: 1, padding: "20px 40px" }}>
          <ActualFalhaRDP />
        </div>
      </div>

      {/* ── 3. Sistema Actual — Rede & Latência ──────────────────────── */}
      <div style={scrollSlide}>
        <PageBanner title="Sistema Actual — Rede & Latência" sub="análise IEC 104 por VLAN" color={C.blue} />
        <div style={{ flex: 1, padding: "20px 40px" }}>
          <RedeAnalise />
        </div>
      </div>

      {/* ── 4. Sistema Proposto — Arquitectura ───────────────────────── */}
      <div style={fixedSlide}>
        <PageBanner title="Sistema Proposto — Arquitectura" sub="EDP Acessos · nova proposta" color={C.green} />
        <div style={{ flex: 1, padding: "12px 40px 12px", overflow: "hidden" }}>
          <PropostoArquitectura />
        </div>
      </div>

      {/* ── 5. Sistema Proposto — Resumo & Ganhos ────────────────────── */}
      <div style={scrollSlide}>
        <PageBanner title="Sistema Proposto — Resumo & Ganhos" sub="antes e depois · comparação completa" color={C.green} />
        <div style={{ flex: 1, padding: "20px 40px" }}>
          <PropostoResumo />
        </div>
      </div>

      {/* ── 6. Sistema Proposto — Simulação ──────────────────────────── */}
      <div style={scrollSlide}>
        <PageBanner title="Sistema Proposto — Simulação" sub="demonstração passo a passo" color={C.navy} />
        <div style={{ flex: 1, padding: "20px 40px" }}>
          <PropostoSimulacao />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════

export default function Apresentacao() {
  const [tab, setTab] = useState<TabMain>("actual");
  const [topicActual, setTopicActual] = useState<TopicActual>("arquitectura");
  const [topicProposto, setTopicProposto] = useState<TopicProposto>("arquitectura");

  const accent = tab === "actual" ? C.red : C.green;

  return (
    <div style={{
      flex: 1, overflowY: "auto", overflowX: "hidden",
      background: C.paper,
      backgroundImage: "radial-gradient(rgba(0,0,0,.04) 1px, transparent 1px), radial-gradient(rgba(0,0,0,.03) 1px, transparent 1px)",
      backgroundSize: "24px 24px, 24px 24px",
      backgroundPosition: "0 0, 12px 12px",
      fontFamily: "'Mulish', system-ui, sans-serif",
      color: C.ink,
    }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;600;700&family=Kalam:wght@400;700&family=Gloria+Hallelujah&family=Mulish:wght@400;600;700&display=swap" />

      {/* ── Chrome principal ─────────────────────────────────────────────── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        background: C.paper, borderBottom: `2px solid ${C.ink}`,
        padding: "14px 28px", display: "flex", alignItems: "baseline", gap: 22, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 30, lineHeight: 1 }}>EDP Acessos · Apresentação</div>
          <div style={{ fontFamily: "'Gloria Hallelujah', cursive", fontSize: 12, opacity: 0.65, marginTop: 2 }}>controlo de sessões RDP e acessos SCADA · eclusas de navegação</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {([
            { id: "actual"   as TabMain, label: "Sistema Actual",   color: C.red },
            { id: "proposto" as TabMain, label: "Sistema Proposto", color: C.green },
          ]).map(({ id, label, color }) => (
            <button key={id} onClick={() => setTab(id)} style={{
              fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 14,
              background: tab === id ? color : C.paper,
              color: tab === id ? "white" : C.ink,
              border: `2px solid ${tab === id ? color : C.ink}`,
              padding: "6px 18px", borderRadius: "22px 18px 24px 16px",
              cursor: "pointer", boxShadow: tab === id ? `3px 3px 0 ${C.ink}` : `2px 2px 0 rgba(0,0,0,0.15)`,
              transition: "all .15s",
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── Sub-nav por tópico ────────────────────────────────────────────── */}
      <div style={{
        position: "sticky", top: 80, zIndex: 10,
        background: C.paper2, borderBottom: `1.5px dashed ${C.ink}`,
        padding: "10px 28px", display: "flex", gap: 8, flexWrap: "wrap",
      }}>
        {tab === "actual" && TOPICS_ACTUAL.map(({ id, label }) => (
          <button key={id} onClick={() => setTopicActual(id)} style={{
            fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 13,
            background: topicActual === id ? accent : C.paper,
            color: topicActual === id ? "white" : C.ink,
            border: `1.5px solid ${topicActual === id ? accent : C.ink}`,
            padding: "5px 14px", borderRadius: "16px 12px 18px 10px",
            cursor: "pointer", boxShadow: topicActual === id ? `2px 2px 0 ${C.ink}` : "none",
            transition: "all .12s",
          }}>{label}</button>
        ))}
        {tab === "proposto" && TOPICS_PROPOSTO.map(({ id, label }) => (
          <button key={id} onClick={() => setTopicProposto(id)} style={{
            fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 13,
            background: topicProposto === id ? accent : C.paper,
            color: topicProposto === id ? "white" : C.ink,
            border: `1.5px solid ${topicProposto === id ? accent : C.ink}`,
            padding: "5px 14px", borderRadius: "16px 12px 18px 10px",
            cursor: "pointer", boxShadow: topicProposto === id ? `2px 2px 0 ${C.ink}` : "none",
            transition: "all .12s",
          }}>{label}</button>
        ))}
      </div>

      {/* ── Conteúdo ─────────────────────────────────────────────────────── */}
      <div style={{ padding: "20px 40px 20px" }}>
        {tab === "actual"   && topicActual === "arquitectura"  && <ActualArquitectura />}
        {tab === "actual"   && topicActual === "falha-rdp"     && <ActualFalhaRDP />}
        {tab === "actual"   && topicActual === "falha-edp"     && <RedeAnalise />}

        {tab === "proposto" && topicProposto === "arquitectura" && <PropostoArquitectura />}
        {tab === "proposto" && topicProposto === "resumo"       && <PropostoResumo />}
        {tab === "proposto" && topicProposto === "simulacao"    && <PropostoSimulacao />}
      </div>
    </div>
  );
}
