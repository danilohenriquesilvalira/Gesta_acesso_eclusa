import React, { useState } from "react";

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

function SkBox({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      border: `2px solid ${C.ink}`, borderRadius: "10px 14px 8px 12px",
      padding: 16, background: C.paper, ...style,
    }}>
      {children}
    </div>
  );
}

function SkLine({ style }: { style?: React.CSSProperties }) {
  return <div style={{ height: 2, background: C.ink, borderRadius: 2, margin: "8px 0", opacity: 0.8, ...style }} />;
}

function Hand({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, lineHeight: 1.1, ...style }}>{children}</div>;
}

function Note({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontFamily: "'Gloria Hallelujah', cursive", fontSize: 12, opacity: 0.65, lineHeight: 1.5, ...style }}>{children}</div>;
}

function Tag({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span style={{
      display: "inline-block", fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 12,
      padding: "3px 10px", border: `1.5px solid ${C.ink}`, borderRadius: "16px 12px 18px 10px",
      background: C.paper, ...style,
    }}>{children}</span>
  );
}

function Torn() {
  return (
    <div style={{
      height: 14, margin: "4px 0",
      backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 14'><path d='M0 7 L 8 3 L 16 9 L 24 4 L 32 8 L 40 3 L 48 9 L 56 5 L 64 8 L 72 3 L 80 9 L 88 4 L 96 8 L 104 3 L 112 9 L 120 4 L 128 8 L 136 3 L 144 9 L 152 5 L 160 8 L 168 3 L 176 9 L 184 4 L 192 8 L 200 5' stroke='%231a1a1a' stroke-width='1.5' fill='none'/></svg>")`,
      backgroundRepeat: "repeat-x", opacity: 0.35,
    }} />
  );
}

function SectionLabel({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
      <div style={{
        width: 48, height: 48, border: `2.5px solid ${C.ink}`, borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 22, flexShrink: 0,
      }}>{n}</div>
      <Hand style={{ fontSize: 28 }}>{children}</Hand>
    </div>
  );
}

function Cross({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
      <div style={{
        width: 26, height: 26, border: `2px solid ${C.red}`, borderRadius: 4,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: C.red, fontFamily: "'Caveat', cursive", fontWeight: 900, fontSize: 18, flexShrink: 0, marginTop: 1,
      }}>X</div>
      <span style={{ fontFamily: "'Mulish', sans-serif", fontSize: 15, lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

function Check({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
      <div style={{
        width: 26, height: 26, border: `2px solid ${C.green}`, borderRadius: 4,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: C.green, fontFamily: "'Caveat', cursive", fontWeight: 900, fontSize: 18, flexShrink: 0, marginTop: 1,
      }}>V</div>
      <span style={{ fontFamily: "'Mulish', sans-serif", fontSize: 15, lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

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

function DiagramaArquitectura() {
  return (
    <div style={{ border: `2.5px solid ${C.ink}`, borderRadius: "18px 22px 16px 24px", background: C.paper, boxShadow: `5px 5px 0 ${C.ink}`, padding: 12, position: "relative" }}>
      <Note style={{ marginBottom: 8, fontSize: 11 }}>diagrama · arquitectura actual</Note>
      <img
        src="/Projeto_atual.svg"
        alt="Diagrama arquitectura actual"
        style={{ width: "100%", height: "auto", display: "block", borderRadius: 8 }}
      />
    </div>
  );
}

function DiagramaFalhaRDP() {
  return (
    <div style={{ border: `2.5px solid ${C.ink}`, borderRadius: "18px 14px 16px 20px", background: C.paper, boxShadow: `5px 5px 0 ${C.ink}`, padding: 20 }}>
      <Note style={{ marginBottom: 14, fontSize: 11 }}>diagrama · sequencia de falha RDP</Note>

      <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto" }}>
        <div style={{ textAlign: "center", minWidth: 110 }}>
          <div style={{ border: `2px solid ${C.ink}`, borderRadius: 8, padding: "8px 10px", background: C.paper2, marginBottom: 8 }}>
            <Hand style={{ fontSize: 16 }}>Mini PC</Hand>
            <Note style={{ fontSize: 10 }}>Operador</Note>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 80, textAlign: "center", position: "relative" }}>
          <svg width="100%" height="40" viewBox="0 0 100 40" preserveAspectRatio="none">
            <line x1="0" y1="20" x2="35" y2="20" stroke={C.ink} strokeWidth="2" strokeDasharray="4 3"/>
            <text x="50" y="26" textAnchor="middle" fontFamily="Caveat, cursive" fontSize="20" fontWeight="900" fill={C.red}>X</text>
            <line x1="65" y1="20" x2="100" y2="20" stroke={C.ink} strokeWidth="2" strokeDasharray="4 3"/>
          </svg>
          <Note style={{ fontSize: 9, color: C.red, opacity: 1, marginTop: -6 }}>RDP interrompido</Note>
        </div>

        <div style={{ textAlign: "center", minWidth: 110 }}>
          <div style={{ border: `2px solid ${C.ink}`, borderRadius: 8, padding: "8px 10px", background: C.paper2, marginBottom: 8 }}>
            <Hand style={{ fontSize: 16 }}>Cliente WinCC</Hand>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 40, textAlign: "center" }}>
          <svg width="100%" height="40" viewBox="0 0 60 40" preserveAspectRatio="none">
            <line x1="0" y1="20" x2="50" y2="20" stroke={C.ink} strokeWidth="2"/>
            <polygon points="50,14 60,20 50,26" fill={C.ink}/>
          </svg>
        </div>

        <div style={{ textAlign: "center", minWidth: 110 }}>
          <div style={{ border: `2px solid ${C.accent}`, borderRadius: 8, padding: "8px 10px", background: C.accent + "30" }}>
            <Hand style={{ fontSize: 16 }}>WinCC Server</Hand>
            <Note style={{ fontSize: 9 }}>continua activo</Note>
          </div>
        </div>
      </div>

      <div style={{ height: 14, margin: "12px 0", backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 14'><path d='M0 7 L 8 3 L 16 9 L 24 4 L 32 8 L 40 3 L 48 9 L 56 5 L 64 8 L 72 3 L 80 9 L 88 4 L 96 8 L 104 3 L 112 9 L 120 4 L 128 8 L 136 3 L 144 9 L 152 5 L 160 8 L 168 3 L 176 9 L 184 4 L 192 8 L 200 5' stroke='%231a1a1a' stroke-width='1.5' fill='none'/></svg>\")", backgroundRepeat: "repeat-x", opacity: 0.35 }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
        {[
          { label: "Ecra do operador", text: "pode ficar congelado ou desligado", color: C.red },
          { label: "WinCC Server", text: "continua a funcionar -- nao detecta nada", color: C.accent },
          { label: "Sistema", text: "nao detecta. Nao alerta. Nao regista.", color: C.red },
        ].map(({ label, text, color }) => (
          <div key={label} style={{ border: `2px solid ${color}`, borderRadius: 8, padding: 10, background: color + "10" }}>
            <Hand style={{ fontSize: 16 }}>{label}</Hand>
            <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 13, marginTop: 4, lineHeight: 1.4 }}>{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SistemaActual() {
  return (
    <div>

      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{
            background: C.red, color: "white", border: `2px solid ${C.ink}`,
            borderRadius: "12px 8px 14px 10px", padding: "4px 14px",
            fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 13,
          }}>Sistema Actual</div>
          <Tag>diagnostico</Tag>
          <Tag>SCADA WinCC</Tag>
          <Tag>RDP</Tag>
        </div>
        <Hand style={{ fontSize: 52, marginTop: 10, lineHeight: 1 }}>
          Estrutura <span style={{ color: C.red }}>Atual</span>
        </Hand>
        <Hand style={{ fontSize: 24, marginTop: 6, opacity: 0.6 }}>como esta organizado o sistema hoje</Hand>
        <div style={{ height: 2, background: C.ink, borderRadius: 2, margin: "14px 0", opacity: 0.8, width: "60%" }} />
      </div>

      <div style={{ marginBottom: 40 }}>
        <SectionLabel n="01">A arquitectura — levantamento tecnico</SectionLabel>

        {/* Intro + diagrama lado a lado */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
          <div>
            <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 15, lineHeight: 1.65, marginBottom: 14 }}>
              O sistema assenta no modelo <b>cliente-servidor do WinCC Explorer v7.5</b> — uma arquitectura SCADA da Siemens cuja concepcao remonta a meados dos anos 90. Neste modelo, <b>os clientes nao possuem projecto proprio</b>: toda a logica, todos os tags, todos os scripts e toda a historicizacao residem exclusivamente no <b>WinCC Server</b>.
            </p>
            <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 15, lineHeight: 1.65, marginBottom: 14 }}>
              Cada cliente e essencialmente um <b>terminal burro</b> — abre uma janela de visualizacao e pede ao servidor, via rede, cada valor que precisa de mostrar. Qualquer accao do operador (telecomando, reconhecimento de alarme, navegacao de ecra) gera um pedido de rede ao servidor, que tem de o processar, responder e actualizar todos os outros clientes ligados em simultaneo.
            </p>
            <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 15, lineHeight: 1.65, marginBottom: 14 }}>
              No caso concreto deste projecto, o servidor esta a gerir <b>10 clientes em simultaneo</b>, recebendo tags de todas as eclusas por <b>VLANs separadas</b>, executando scripts partilhados em ciclo continuo, e respondendo a pedidos concorrentes de todos os postos ao mesmo tempo.
            </p>

            {/* Componentes do sistema */}
            <div style={{ marginTop: 4, marginBottom: 16 }}>
              {[
                { label: "VMware ESXi", sub: "1 servidor de virtualizacao fisico — aloja todas as VMs" },
                { label: "WinCC Server", sub: "1 VM — centraliza projecto, tags, scripts, historico" },
                { label: "Clientes WinCC", sub: "10 VMs — sem projecto proprio, dependem 100% do server" },
                { label: "Mesas de operacao", sub: "5 x (posto operacao + posto supervisao)" },
                { label: "Mini PCs", sub: "10 dispositivos fisicos — 2 por mesa" },
                { label: "VLANs de processo", sub: "multiplas — uma por sistema de eclusas" },
                { label: "PLCs das eclusas", sub: "ligados directamente ao WinCC Server via VLANs" },
              ].map(({ label, sub }) => (
                <div key={label} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 7 }}>
                  <div style={{ width: 9, height: 9, border: `2px solid ${C.ink}`, borderRadius: "50%", flexShrink: 0, marginTop: 5 }} />
                  <span style={{ fontFamily: "'Mulish', sans-serif", fontSize: 13, lineHeight: 1.5 }}><b>{label}</b> — {sub}</span>
                </div>
              ))}
            </div>

            {/* Fluxo de comunicacao */}
            <div style={{ border: `2px solid ${C.blue}`, borderRadius: 10, padding: 14, background: C.blue + "08", marginBottom: 14 }}>
              <Hand style={{ fontSize: 16, color: C.blue, marginBottom: 8 }}>Fluxo de comunicacao no sistema actual</Hand>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { step: "1", label: "PLC das eclusas", desc: "envia dados de processo via VLAN dedicada", cor: C.navy },
                  { step: "2", label: "WinCC Server", desc: "recebe, processa e centraliza todos os dados", cor: C.accent },
                  { step: "3", label: "Clientes WinCC (VMs)", desc: "pedem dados ao server via rede interna (NetDDE/DCOM)", cor: C.blue },
                  { step: "4", label: "Camada RDP", desc: "Mini PCs acedem remotamente a cada VM cliente", cor: C.red },
                  { step: "5", label: "Mini PCs nas mesas", desc: "operadores interagem via sessao RDP — invisivel ao WinCC", cor: C.green },
                ].map(({ step, label, desc, cor }) => (
                  <div key={step} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <div style={{ width: 22, height: 22, background: cor, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 13, color: "white" }}>{step}</span>
                    </div>
                    <div>
                      <span style={{ fontFamily: "'Mulish', sans-serif", fontSize: 13, fontWeight: 700 }}>{label}</span>
                      <span style={{ fontFamily: "'Mulish', sans-serif", fontSize: 12, color: "#555", marginLeft: 6 }}>{desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Nota critica sobre o RDP */}
            <div style={{ border: `2px dashed ${C.red}`, borderRadius: 10, padding: 12, background: C.red + "06" }}>
              <Hand style={{ fontSize: 15, color: C.red, marginBottom: 6 }}>O problema invisivel — a camada RDP</Hand>
              <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 13, lineHeight: 1.55, margin: 0 }}>
                Todo o acesso dos operadores ao WinCC passa por uma <b>sessao RDP</b> estabelecida entre o Mini PC fisico e a VM cliente. Esta camada e <b>completamente desconhecida ao WinCC</b> — o servidor trata a VM como localmente activa, independentemente do estado da ligacao remota. Se a sessao cair, o WinCC nao sabe, nao alerta e nao reage.
              </p>
            </div>
          </div>
          <DiagramaArquitectura />
        </div>

        {/* Bloco tecnico: modelo cliente-servidor WinCC v7.5 */}
        <div style={{ border: `2.5px solid ${C.ink}`, borderRadius: "14px 18px 12px 16px", padding: 22, background: C.paper2, marginBottom: 20, boxShadow: `4px 4px 0 ${C.ink}` }}>
          <Hand style={{ fontSize: 22, marginBottom: 12 }}>Como funciona o modelo cliente-servidor WinCC v7.5</Hand>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div>
              <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 14, lineHeight: 1.6, marginBottom: 10 }}>
                No WinCC Explorer v7.5, o servidor e o <b>unico detentor do projecto SCADA</b>. Os clientes ligam-se ao servidor atraves do <b>NetDDE / DCOM</b> (tecnologia Windows da era Windows NT) e recebem os dados por streaming de rede. Nao existe cache local relevante nos clientes.
              </p>
              <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 14, lineHeight: 1.6 }}>
                Todos os <b>Global Scripts</b> (scripts ciclicos de automacao, calculo de setpoints, logica de interlocking) executam <b>no contexto do servidor</b>, num ciclo partilhado. Quando varios clientes desencadeiam accoes em simultaneo, os scripts concorrem pelo mesmo ciclo de execucao.
              </p>
            </div>
            <div>
              <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 14, lineHeight: 1.6, marginBottom: 10 }}>
                O proprio manual da Siemens desaconselha explicitamente a utilizacao de WinCC v7 em ambientes com <b>VLANs segmentadas</b> e latencias de rede variaveis, recomendando uma LAN plana de baixa latencia. No caso actual, o servidor recebe dados de processo por <b>multiplas VLANs</b> distintas, introduzindo jitter e atrasos de sincronizacao.
              </p>
              <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 14, lineHeight: 1.6 }}>
                Esta arquitectura foi concebida para ambientes industriais isolados dos anos 90, com <b>1 a 3 clientes locais</b>, sem acesso remoto, sem VLANs e sem requisitos de seguranca de sessao.
              </p>
            </div>
          </div>
        </div>

        {/* Gargalos tecnicos */}
        <Hand style={{ fontSize: 22, marginBottom: 14 }}>Gargalos identificados na estrutura actual</Hand>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
          {[
            {
              titulo: "Servidor como ponto unico de falha",
              cor: C.red,
              texto: "Toda a logica SCADA, todos os tags de todas as eclusas e todo o historico residem numa unica VM. Uma falha ou sobrecarga do servidor interrompe simultaneamente todos os 10 postos de operacao.",
            },
            {
              titulo: "10 clientes em carga simultanea",
              cor: C.red,
              texto: "O servidor processa em simultaneo pedidos de visualizacao, actualizacoes de tags e confirmacoes de alarme de 10 clientes. O WinCC v7.5 nao foi dimensionado para esta carga com VLANs de processo separadas.",
            },
            {
              titulo: "Race conditions nos Global Scripts",
              cor: C.red,
              texto: "Os scripts ciclicos partilham o mesmo clock de execucao no servidor. Com 10 clientes activos, accoes concorrentes (ex: dois operadores a confirmar alarmes ao mesmo tempo) podem causar conflitos de execucao, atrasos ou resultados imprevistos.",
            },
            {
              titulo: "Latencia por VLANs multiplas",
              cor: "#B45309",
              texto: "Cada sistema de eclusas comunica via uma VLAN de processo separada. O servidor tem de agregar e sincronizar dados de multiplas VLANs com latencias distintas, criando inconsistencias temporais nos dados apresentados aos operadores.",
            },
            {
              titulo: "Tecnologia de 1995 em operacao critica",
              cor: "#B45309",
              texto: "O WinCC Explorer (SCADA WinCC classico) e baseado em arquitecturas Windows NT / COM / NetDDE. Estes protocolos de comunicacao nao tem garantias de entrega, sao vulneraveis a disrupcoes de rede e nao suportam reconexao automatica fiavel.",
            },
            {
              titulo: "Sem mecanismos de sessao ou autenticacao",
              cor: "#B45309",
              texto: "O modelo cliente-servidor do WinCC v7.5 nao inclui gestao de sessao por utilizador a nivel de acesso ao cliente. Nao existe registo de quem esta ligado a qual cliente em que momento.",
            },
          ].map(({ titulo, cor, texto }) => (
            <div key={titulo} style={{ border: `2px solid ${cor}`, borderRadius: 10, padding: 14, background: cor + "0A" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ width: 28, height: 28, border: `2px solid ${cor}`, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", color: cor, fontFamily: "'Caveat', cursive", fontWeight: 900, fontSize: 18, flexShrink: 0 }}>!</div>
                <Hand style={{ fontSize: 17, color: cor, lineHeight: 1.2 }}>{titulo}</Hand>
              </div>
              <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 13, lineHeight: 1.55, margin: 0 }}>{texto}</p>
            </div>
          ))}
        </div>

        <AlertBox color={C.red}>
          <b>Conclusao do levantamento:</b> O sistema funciona — mas assenta numa arquitectura centralizada de 30 anos, a operar fora das condicoes recomendadas pelo fabricante (VLANs, 10 clientes, acesso remoto por RDP). Qualquer instabilidade no servidor ou na rede afecta todos os postos em simultaneo, sem mecanismos de deteccao ou recuperacao automatica.
        </AlertBox>
      </div>

      <Torn />

      <div style={{ marginBottom: 40, marginTop: 32 }}>
        <SectionLabel n="02">O que acontece quando o RDP falha</SectionLabel>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 20 }}>
          <div>
            <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>
              Quando a sessao RDP cai, o WinCC <b>nao e notificado</b>. O servidor continua a tratar aquele posto como activo.
            </p>
            <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>
              Se um operador der uma <b>ordem de telecomando</b> imediatamente antes de a ligacao cair, essa ordem <span style={{ color: C.red, fontWeight: 700 }}>pode nunca chegar a eclusa</span> -- e o sistema nao sabera que falhou.
            </p>

            <AlertBox color={C.red}>
              <b>Cenario critico:</b> Operador envia telecomando -- RDP cai nesse instante -- WinCC Server processa o pedido mas a resposta nunca chega -- eclusa pode nao executar a ordem -- <b>nenhum alerta e gerado</b>.
            </AlertBox>
          </div>

          <DiagramaFalhaRDP />
        </div>
      </div>

      <Torn />

      <div style={{ marginBottom: 40, marginTop: 32 }}>
        <SectionLabel n="03">Outras consequencias da invisibilidade do RDP</SectionLabel>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          <div style={{ border: `2px solid ${C.ink}`, borderRadius: "10px 14px 8px 12px", padding: 16, background: C.paper, borderColor: C.red }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, border: `2.5px solid ${C.red}`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: C.red, fontFamily: "'Caveat', cursive", fontWeight: 900, fontSize: 22, flexShrink: 0 }}>X</div>
              <Hand style={{ fontSize: 22, color: C.red, lineHeight: 1 }}>Sem controlo de quem abre a sessao</Hand>
            </div>
            <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 14, lineHeight: 1.55 }}>
              Qualquer pessoa com acesso a rede pode estabelecer uma sessao RDP a um Cliente WinCC. O WinCC <b>nao distingue</b> um operador autorizado de uma ligacao nao autorizada.
            </p>
          </div>

          <div style={{ border: `2px solid ${C.red}`, borderRadius: "10px 14px 8px 12px", padding: 16, background: C.paper }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, border: `2.5px solid ${C.red}`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: C.red, fontFamily: "'Caveat', cursive", fontWeight: 900, fontSize: 22, flexShrink: 0 }}>X</div>
              <Hand style={{ fontSize: 22, color: C.red, lineHeight: 1 }}>Sem interlocking real</Hand>
            </div>
            <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 14, lineHeight: 1.55 }}>
              Dois postos podem aceder a <b>mesma eclusa em simultaneo</b>. O WinCC nao tem forma de impedir conflitos de telecomando originados em sessoes RDP diferentes.
            </p>
          </div>

          <div style={{ border: `2px solid ${C.red}`, borderRadius: "10px 14px 8px 12px", padding: 16, background: C.paper }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, border: `2.5px solid ${C.red}`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: C.red, fontFamily: "'Caveat', cursive", fontWeight: 900, fontSize: 22, flexShrink: 0 }}>X</div>
              <Hand style={{ fontSize: 22, color: C.red, lineHeight: 1 }}>Supervisao sem garantias</Hand>
            </div>
            <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 14, lineHeight: 1.55 }}>
              O posto de supervisao de cada mesa esta tambem dependente de uma <b>sessao RDP propria</b>. Se essa sessao cair, o supervisor perde a visibilidade -- <b>sem qualquer alerta</b>.
            </p>
          </div>

          <div style={{ border: `2px solid ${C.red}`, borderRadius: "10px 14px 8px 12px", padding: 16, background: C.paper }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, border: `2.5px solid ${C.red}`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: C.red, fontFamily: "'Caveat', cursive", fontWeight: 900, fontSize: 22, flexShrink: 0 }}>X</div>
              <Hand style={{ fontSize: 22, color: C.red, lineHeight: 1 }}>Sem registo de sessoes</Hand>
            </div>
            <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 14, lineHeight: 1.55 }}>
              Nao existe historico de quando cada sessao RDP foi estabelecida, quem a iniciou, ou quando terminou. Em caso de incidente, <b>nao ha rastreabilidade</b>.
            </p>
          </div>
        </div>

        <div style={{ marginTop: 24, border: `3px solid ${C.ink}`, borderRadius: "16px 20px 14px 18px", padding: 24, background: C.navy, color: "white", boxShadow: `6px 6px 0 ${C.ink}` }}>
          <Hand style={{ fontSize: 28, color: "white", marginBottom: 10 }}>Resumo do diagnostico</Hand>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              "O WinCC nao monitoriza o estado das sessoes RDP",
              "Nao ha controlo de acesso a camada de ligacao remota",
              "Conflitos de telecomando sao possiveis e nao detectados",
              "Perda de supervisao sem alerta ao operador ou sistema",
              "Zero rastreabilidade em caso de incidente",
              "A seguranca operacional depende inteiramente de procedimentos manuais",
            ].map(t => <Cross key={t} text={t} />)}
          </div>
        </div>
      </div>

      <div style={{ border: `2.5px dashed ${C.ink}`, borderRadius: 14, padding: 28, textAlign: "center", background: C.paper2, marginBottom: 20 }}>
        <Hand style={{ fontSize: 22, opacity: 0.5 }}>[ espaco reservado para imagem real da sala de telecomando ]</Hand>
        <Note style={{ marginTop: 6 }}>fotografia da sala / ecras / mesas de operacao -- a inserir</Note>
      </div>
    </div>
  );
}

function DiagramaArquitecturaProposta() {
  return (
    <div style={{ border: `2.5px solid ${C.ink}`, borderRadius: "18px 22px 16px 24px", background: C.paper, boxShadow: `5px 5px 0 ${C.ink}`, padding: 20, position: "relative" }}>
      <Note style={{ marginBottom: 12, fontSize: 11 }}>diagrama · arquitectura proposta — descentralizada</Note>

      {/* ESXi container */}
      <div style={{ border: `2.5px solid ${C.blue}`, borderRadius: 12, padding: "18px 10px 14px", background: C.blue + "08", position: "relative", marginBottom: 0 }}>
        <div style={{ position: "absolute", top: -12, left: 14, background: C.paper, padding: "0 8px", fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 13, color: C.blue, border: `1.5px solid ${C.blue}`, borderRadius: 4 }}>VMware ESXi</div>

        {/* 5 WinCC Servers individuais */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
          {[1,2,3,4,5].map(n => (
            <div key={n} style={{ border: `2px solid ${C.accent}`, borderRadius: 8, padding: "8px 4px", background: C.accent + "18", textAlign: "center" }}>
              <Hand style={{ fontSize: 13 }}>Server {n}</Hand>
              <Note style={{ fontSize: 7, marginTop: 2 }}>WinCC Server</Note>
              <Note style={{ fontSize: 7 }}>projecto proprio</Note>
              <div style={{ marginTop: 5, border: `1.5px solid ${C.blue}`, borderRadius: 5, padding: "2px 3px", background: C.paper }}>
                <Note style={{ fontSize: 7, color: C.blue }}>Client WinCC {n}</Note>
              </div>
              <div style={{ marginTop: 4, border: `1.5px solid ${C.green}`, borderRadius: 5, padding: "2px 3px", background: C.paper }}>
                <Note style={{ fontSize: 7, color: C.green }}>PLC directo</Note>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Arrow down to EDP Acessos */}
      <svg width="100%" height="18" style={{ display: "block" }}>
        <line x1="50%" y1="0" x2="50%" y2="18" stroke={C.green} strokeWidth="2" strokeDasharray="3 2"/>
      </svg>

      {/* EDP Acessos Layer */}
      <div style={{ border: `2.5px solid ${C.green}`, borderRadius: 8, padding: "10px 12px 8px", background: C.green + "10", position: "relative", marginBottom: 0 }}>
        <div style={{ position: "absolute", top: -12, left: 14, background: C.paper, padding: "0 8px", fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 12, color: C.green, border: `1.5px solid ${C.green}`, borderRadius: 4 }}>EDP Acessos — camada de controlo inteligente</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginTop: 4 }}>
          {[
            { label: "Monitor RDP", color: C.green },
            { label: "Auth / Permissoes", color: C.blue },
            { label: "Interlocking", color: C.accent },
            { label: "Audit Log", color: C.navy },
          ].map(({ label, color }) => (
            <div key={label} style={{ border: `1.5px solid ${color}`, borderRadius: 5, padding: "4px 4px", textAlign: "center", background: color + "15" }}>
              <Note style={{ fontSize: 9, color, opacity: 1, fontWeight: 700 }}>{label}</Note>
            </div>
          ))}
        </div>
      </div>

      {/* Arrow down to RDP + Mini PCs */}
      <svg width="100%" height="18" style={{ display: "block" }}>
        <line x1="50%" y1="0" x2="50%" y2="18" stroke={C.ink} strokeWidth="1.5" strokeDasharray="3 2"/>
      </svg>

      {/* RDP Layer — agora controlada */}
      <div style={{ border: `2px solid ${C.green}`, borderRadius: 7, padding: "8px 10px 6px", background: C.green + "06", position: "relative", marginBottom: 0 }}>
        <div style={{ position: "absolute", top: -11, left: 14, background: C.paper, padding: "0 8px", fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 11, color: C.green, border: `1px solid ${C.green}`, borderRadius: 4 }}>Camada RDP — monitorizada e gerida</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 5, marginTop: 4 }}>
          {[1,2,3,4,5].map(n => (
            <div key={n} style={{ border: `1.5px solid ${C.green}`, borderRadius: 5, padding: "3px 2px", textAlign: "center", background: C.green + "08" }}>
              <Note style={{ fontSize: 8, color: C.green, opacity: 1 }}>RDP {n}</Note>
              <Note style={{ fontSize: 7 }}>shadow OK</Note>
            </div>
          ))}
        </div>
      </div>

      {/* Arrow + Mini PCs */}
      <svg width="100%" height="18" style={{ display: "block" }}>
        <line x1="50%" y1="0" x2="50%" y2="18" stroke={C.ink} strokeWidth="1.5" strokeDasharray="3 2"/>
      </svg>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
        {[1,2,3,4,5].map(n => (
          <div key={n} style={{ border: `2px solid ${C.green}`, borderRadius: 8, padding: "5px 3px", background: C.green + "10" }}>
            <Hand style={{ fontSize: 13, textAlign: "center" }}>Mesa {n}</Hand>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
              <div style={{ border: `1.5px solid ${C.ink}`, borderRadius: 4, padding: "2px 3px", textAlign: "center", background: C.paper }}>
                <Note style={{ fontSize: 7 }}>Mini PC A</Note>
              </div>
              <div style={{ border: `1.5px solid ${C.ink}`, borderRadius: 4, padding: "2px 3px", textAlign: "center", background: C.paper }}>
                <Note style={{ fontSize: 7 }}>Mini PC B</Note>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Note style={{ marginTop: 8, fontSize: 8 }}>5 servidores independentes · 5 clientes WinCC · EDP Acessos · 5 RDP monitorizados · 10 Mini PCs</Note>
    </div>
  );
}

function SistemaProposto() {
  return (
    <div>

      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{
            background: C.green, color: "white", border: `2px solid ${C.ink}`,
            borderRadius: "12px 8px 14px 10px", padding: "4px 14px",
            fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 13,
          }}>Sistema Proposto</div>
          <Tag>solucao</Tag>
          <Tag>EDP Acessos</Tag>
          <Tag>descentralizacao</Tag>
        </div>
        <Hand style={{ fontSize: 52, marginTop: 10, lineHeight: 1 }}>
          Controlo total. <span style={{ color: C.green }}>Arquitectura nova.</span>
        </Hand>
        <Hand style={{ fontSize: 24, marginTop: 6, opacity: 0.6 }}>o que o EDP Acessos torna possivel</Hand>
        <div style={{ height: 2, background: C.ink, borderRadius: 2, margin: "14px 0", opacity: 0.8, width: "60%" }} />
      </div>

      {/* SECÇÃO 01 — O sistema EDP Acessos */}
      <div style={{ marginBottom: 40 }}>
        <SectionLabel n="01">O sistema EDP Acessos — a camada de controlo</SectionLabel>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
          <div>
            <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 15, lineHeight: 1.65, marginBottom: 14 }}>
              O <b>EDP Acessos</b> é uma camada de software desenvolvida especificamente para resolver os gargalos identificados na estrutura actual. Ao contrario do WinCC — que foi concebido sem qualquer mecanismo de gestao de sessao remota — o EDP Acessos <b>monitoriza continuamente o estado real de cada sessao RDP</b>, interpoe-se no fluxo de acesso e toma decisoes de routing em tempo real.
            </p>
            <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 15, lineHeight: 1.65, marginBottom: 14 }}>
              A monitorizacao e feita usando mecanismos nativos do Windows que permitem ao sistema <b>observar qualquer sessao RDP activa</b>, verificar o seu estado em tempo real, e detectar desconexoes imediatamente — sem depender do WinCC para o fazer.
            </p>

            {/* Visual: fluxo de acesso com EDP Acessos */}
            <div style={{ border: `2px solid ${C.green}`, borderRadius: 10, padding: 16, background: C.green + "08", marginBottom: 14 }}>
              <Note style={{ fontSize: 10, marginBottom: 10 }}>fluxo de acesso com EDP Acessos</Note>
              <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                {[
                  { icon: "→", label: "Operador autentica", sub: "credenciais EDP", cor: C.blue },
                  { icon: "→", label: "EDP Acessos verifica", sub: "permissoes + disponibilidade", cor: C.green },
                  { icon: "→", label: "RDP estabelecido", sub: "shadow activo", cor: C.accent },
                  { icon: "→", label: "Monitorizado", sub: "heartbeat continuo", cor: C.navy },
                ].map(({ icon, label, sub, cor }, i) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                    {i > 0 && <div style={{ color: cor, fontFamily: "'Caveat', cursive", fontWeight: 900, fontSize: 22, padding: "0 4px", flexShrink: 0 }}>{icon}</div>}
                    <div style={{ border: `1.5px solid ${cor}`, borderRadius: 7, padding: "8px 6px", background: cor + "15", textAlign: "center", flex: 1 }}>
                      <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 14, color: cor }}>{label}</div>
                      <Note style={{ fontSize: 9, marginTop: 2 }}>{sub}</Note>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 15, lineHeight: 1.65 }}>
              Com este controlo, o sistema consegue <b>autenticar o operador antes de estabelecer a sessao</b>, verificar as suas permissoes, confirmar que a eclusa destino esta disponivel, e registar toda a actividade de forma auditavel.
            </p>
          </div>
          <DiagramaArquitecturaProposta />
        </div>

        {/* Bloco tecnico: o que o EDP Acessos faz */}
        <div style={{ border: `2.5px solid ${C.ink}`, borderRadius: "14px 18px 12px 16px", padding: 22, background: C.paper2, marginBottom: 20, boxShadow: `4px 4px 0 ${C.ink}` }}>
          <Hand style={{ fontSize: 22, marginBottom: 14 }}>Os quatro modulos do EDP Acessos</Hand>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
            {[
              { titulo: "Monitor RDP", cor: C.green, items: ["Estado em tempo real de cada sessao", "Deteccao imediata de desconexao", "Shadow via mstsc nativo do Windows", "Heartbeat por sessao activa"] },
              { titulo: "Controlo de Acesso", cor: C.blue, items: ["Autenticacao por credenciais EDP", "Permissoes por operador e por eclusa", "Apenas postos autorizados acedem", "Sem accesso directo ao WinCC Client"] },
              { titulo: "Interlocking", cor: C.accent, items: ["Exclusividade: 1 operador por eclusa", "Conflitos de telecomando eliminados", "Posto ocupado visivel a todos", "Libertacao automatica por timeout"] },
              { titulo: "Auditoria", cor: C.navy, items: ["Log completo: quem, quando, qual posto", "Registo de cada acesso e desconexao", "Rastreabilidade total em caso de incidente", "Exportacao para relatorio"] },
            ].map(({ titulo, cor, items }) => (
              <div key={titulo} style={{ border: `2px solid ${cor}`, borderRadius: 10, padding: 14, background: cor + "0A" }}>
                <Hand style={{ fontSize: 18, color: cor, marginBottom: 10 }}>{titulo}</Hand>
                {items.map(t => (
                  <div key={t} style={{ display: "flex", gap: 7, alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ width: 7, height: 7, background: cor, borderRadius: "50%", flexShrink: 0, marginTop: 5 }} />
                    <span style={{ fontFamily: "'Mulish', sans-serif", fontSize: 12, lineHeight: 1.5 }}>{t}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <AlertBox color={C.green}>
          <b>O resultado imediato:</b> o numero de Clientes WinCC necessarios desce de <b>10 para 5</b>. Como o EDP Acessos gere o routing das sessoes, cada mesa pode aceder a qualquer eclusa disponivel sem necessitar de um cliente WinCC dedicado — o sistema dirige a sessao para o cliente correcto em funcao da disponibilidade real.
        </AlertBox>
      </div>

      <Torn />

      {/* SECÇÃO 02 — Descentralização */}
      <div style={{ marginBottom: 40, marginTop: 32 }}>
        <SectionLabel n="02">Descentralizacao — de 1 servidor para 5</SectionLabel>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
          <div>
            <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 15, lineHeight: 1.65, marginBottom: 14 }}>
              O sistema actual assenta numa arquitectura <b>completamente centralizada</b>: 1 WinCC Server gere todos os sistemas de eclusas, todos os PLCs, todos os scripts e todos os tags. Qualquer falha ou sobrecarga neste servidor afecta imediatamente todos os postos.
            </p>
            <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 15, lineHeight: 1.65, marginBottom: 14 }}>
              O sistema proposto passa a <b>5 WinCC Servers independentes</b> — um por sistema de eclusas. Cada servidor tem o seu <b>projecto WinCC proprio</b>, os seus scripts dedicados, e uma <b>ligacao directa unica ao seu PLC</b>. Nao existem scripts partilhados, nao existem race conditions, nao existe dependencia cruzada entre sistemas.
            </p>
            <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 15, lineHeight: 1.65 }}>
              Esta descentralizacao <b>so e possivel gracas ao EDP Acessos</b>. No modelo actual, os 10 clientes precisam de aceder ao mesmo servidor central para partilhar informacao de estado entre postos. Com o EDP Acessos a gerir toda a camada de acesso e routing, cada servidor pode operar de forma <b>completamente autonoma</b> — o sistema de controlo de acessos e que sabe o estado global, nao o WinCC.
            </p>
          </div>

          <div>
            {/* Comparação visual centralizado vs descentralizado */}
            <div style={{ border: `2.5px solid ${C.ink}`, borderRadius: 12, overflow: "hidden", boxShadow: `4px 4px 0 ${C.ink}`, display: "grid", gridTemplateColumns: "1fr 1fr" }}>
              <div style={{ background: C.red, padding: "10px 16px", borderRight: `2px solid ${C.ink}` }}>
                <Hand style={{ fontSize: 16, color: "white" }}>Actual — Centralizado</Hand>
              </div>
              <div style={{ background: C.green, padding: "10px 16px" }}>
                <Hand style={{ fontSize: 16, color: "white" }}>Proposto — Distribuido</Hand>
              </div>
              {[
                ["1 WinCC Server unico", "5 WinCC Servers independentes"],
                ["10 Clientes WinCC", "5 Clientes WinCC (−50%)"],
                ["Scripts partilhados — race conditions", "Scripts isolados por servidor"],
                ["1 PLC via multiplas VLANs", "1 PLC directo por servidor"],
                ["Falha do server = falha total", "Falha isolada — outros servers ok"],
                ["RDP invisivel ao sistema", "RDP monitorizado e gerido pelo EDP Acessos"],
                ["Sem autenticacao de operador", "Autenticacao obrigatoria pre-sessao"],
                ["Zero rastreabilidade", "Auditoria completa e automatica"],
              ].map(([atual, proposto], i) => (
                <React.Fragment key={i}>
                  <div style={{ padding: "8px 16px", borderRight: `2px solid ${C.ink}`, borderTop: `2px solid ${C.ink}`, background: i % 2 === 0 ? C.paper : C.paper2 }}>
                    <span style={{ fontFamily: "'Mulish', sans-serif", fontSize: 13, color: C.red }}>✗ {atual}</span>
                  </div>
                  <div style={{ padding: "8px 16px", borderTop: `2px solid ${C.ink}`, background: i % 2 === 0 ? C.paper : C.paper2 }}>
                    <span style={{ fontFamily: "'Mulish', sans-serif", fontSize: 13, color: C.green }}>✓ {proposto}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* 6 melhorias tecnicas */}
        <Hand style={{ fontSize: 22, marginBottom: 14 }}>Melhorias tecnicas da descentralizacao</Hand>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
          {[
            { titulo: "Eliminacao das race conditions", cor: C.green, texto: "Com scripts isolados por servidor, nao existe concorrencia de execucao. Cada servidor executa os seus scripts no seu proprio ciclo, sem interferencia dos outros postos ou servidores." },
            { titulo: "Latencia de rede reduzida", cor: C.green, texto: "Cada servidor comunica directamente com o seu PLC na sua VLAN. Nao ha agregacao de multiplas VLANs num unico ponto, eliminando o jitter e os atrasos de sincronizacao cruzada." },
            { titulo: "Falha isolada por sistema", cor: C.green, texto: "Se um servidor tiver problema, apenas as eclusas desse sistema sao afectadas. Os outros 4 sistemas continuam operacionais — ao contrario do actual, onde 1 falha paralisa tudo." },
            { titulo: "Reducao de 10 para 5 clientes", cor: C.blue, texto: "O EDP Acessos gere o routing de sessoes, permitindo que cada mesa aceda a qualquer eclusa disponivel. Deixa de ser necessario 1 cliente fixo por posto — 5 clientes chegam para 5 mesas." },
            { titulo: "Projecto WinCC proprio por servidor", cor: C.blue, texto: "Cada servidor mantem apenas os tags e scripts relevantes para as suas eclusas. Projectos mais pequenos, mais rapidos, mais faceis de manter e diagnosticar individualmente." },
            { titulo: "Escalabilidade futura", cor: C.blue, texto: "A arquitectura distribuida permite adicionar novos sistemas de eclusas sem impacto nos existentes. Basta adicionar um novo servidor WinCC e registar no EDP Acessos." },
          ].map(({ titulo, cor, texto }) => (
            <div key={titulo} style={{ border: `2px solid ${cor}`, borderRadius: 10, padding: 14, background: cor + "0A" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ width: 26, height: 26, border: `2px solid ${cor}`, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", color: cor, fontFamily: "'Caveat', cursive", fontWeight: 900, fontSize: 17, flexShrink: 0 }}>V</div>
                <Hand style={{ fontSize: 16, color: cor, lineHeight: 1.2 }}>{titulo}</Hand>
              </div>
              <p style={{ fontFamily: "'Mulish', sans-serif", fontSize: 13, lineHeight: 1.55, margin: 0 }}>{texto}</p>
            </div>
          ))}
        </div>

        <AlertBox color={C.green}>
          <b>Por que o sistema actual nao permite isto:</b> No WinCC centralizado, os clientes dependem do servidor para partilhar estado entre si (qual eclusa esta ocupada, qual operador esta activo). Sem essa informacao centralizada no WinCC, o interlocking entre postos seria impossivel. O EDP Acessos assume essa funcao — tornando o WinCC livre para ser descentralizado.
        </AlertBox>
      </div>

      <Torn />

      {/* SECÇÃO 03 — Resumo e ganhos */}
      <div style={{ marginBottom: 40, marginTop: 32 }}>
        <SectionLabel n="03">Resumo dos ganhos da solucao proposta</SectionLabel>

        <div style={{ border: `3px solid ${C.ink}`, borderRadius: "16px 20px 14px 18px", padding: 28, background: C.navy, color: "white", boxShadow: `6px 6px 0 ${C.ink}` }}>
          <Hand style={{ fontSize: 30, color: "white", marginBottom: 16 }}>O que o EDP Acessos resolve</Hand>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              "Camada RDP monitorizada em tempo real — fim da invisibilidade",
              "Autenticacao obrigatoria antes de qualquer acesso ao WinCC",
              "Interlocking real: impossivel dois postos na mesma eclusa",
              "Alertas automaticos ao supervisor em caso de queda de sessao",
              "Auditoria completa: quem acedeu, quando, a que eclusa",
              "Reducao de 10 para 5 Clientes WinCC necessarios",
              "Descentralizacao: 5 servidores independentes, sem ponto unico de falha",
              "Eliminacao das race conditions nos Global Scripts",
              "Cada servidor com projecto proprio e ligacao directa ao PLC",
              "Escalabilidade sem impacto nos sistemas existentes",
            ].map(t => <Check key={t} text={t} />)}
          </div>
        </div>
      </div>

    </div>
  );
}

type Tab = "actual" | "proposto";

export default function Apresentacao() {
  const [tab, setTab] = useState<Tab>("actual");

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

      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: C.paper, borderBottom: `2px solid ${C.ink}`,
        padding: "16px 28px", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
      }}>
        <div>
          <Hand style={{ fontSize: 30, lineHeight: 1 }}>EDP Acessos · Apresentacao do Sistema</Hand>
          <Note style={{ marginTop: 2 }}>controlo de sessoes RDP e acessos SCADA · eclusas de navegacao</Note>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {([
            { id: "actual" as Tab, label: "X Sistema Actual", activeColor: C.red },
            { id: "proposto" as Tab, label: "V Sistema Proposto", activeColor: C.green },
          ]).map(({ id, label, activeColor }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 15,
                background: tab === id ? activeColor : C.paper,
                color: tab === id ? "white" : C.ink,
                border: `2.5px solid ${tab === id ? activeColor : C.ink}`,
                padding: "8px 20px",
                borderRadius: "22px 18px 24px 16px",
                cursor: "pointer",
                boxShadow: tab === id ? `3px 3px 0 ${C.ink}` : `2px 2px 0 rgba(0,0,0,0.15)`,
                transition: "all .15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "36px 48px 100px" }}>
        {tab === "actual"   && <SistemaActual />}
        {tab === "proposto" && <SistemaProposto />}
      </div>
    </div>
  );
}
