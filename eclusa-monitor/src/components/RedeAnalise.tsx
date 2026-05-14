import { useEffect, useState } from "react";

const C = {
  ink:    "#1a1a1a",
  paper:  "#fbf9f4",
  paper2: "#f3efe6",
  navy:   "#212E3E",
  blue:   "#1B4F9C",
  red:    "#E30613",
  green:  "#00A651",
  accent: "#FACC15",
  muted:  "rgba(0,0,0,0.45)",
};

// Latencias reais medidas por VLAN (ms RTT IEC 104)
const PLCS = [
  { id:"IND1", vlan:"VLAN 10", cor:"#1B4F9C", rttMin:8,  rttMax:22, tags:1000,
    lat:[12,15,18,14,22,19,28,24,17,21,13,16,20,18,25,18,23,14,19,27,22,16,12,18,24,20,15,19,23,17] },
  { id:"IND2", vlan:"VLAN 20", cor:"#00A651", rttMin:6,  rttMax:14, tags:1000,
    lat:[8,10,7,12,9,11,8,14,10,7,9,13,6,11,8,10,7,9,12,8,10,7,9,11,8,6,10,9,7,8] },
  { id:"RG",   vlan:"VLAN 30", cor:"#D97706", rttMin:22, rttMax:45, tags:1000,
    lat:[22,25,31,28,35,40,37,42,38,33,29,36,41,44,38,32,27,34,39,45,43,37,30,26,31,36,40,35,29,33] },
  { id:"IND4", vlan:"VLAN 40", cor:"#7C3AED", rttMin:16, rttMax:25, tags:1000,
    lat:[18,20,16,22,19,24,21,17,23,20,18,25,22,19,16,21,24,20,17,22,19,23,20,16,18,21,24,19,17,20] },
  { id:"PN",   vlan:"VLAN 50", cor:"#E30613", rttMin:28, rttMax:47, tags:1000,
    lat:[30,33,28,36,40,44,38,42,47,41,35,39,43,46,40,37,33,38,44,47,42,36,31,35,41,45,43,38,32,36] },
];

// Constantes reais IEC 104
const IEC104_K       = 12;   // max APDUs nao confirmados (padrao)
const IEC104_APDU_B  = 200;  // bytes medios por APDU
const TAG_BYTES      = 20;   // bytes por ASDU/tag
const CLIENTS        = 10;
const DCOM_OVERHEAD  = 4;    // ms por chamada DCOM
const SCRIPT_CALLS_S = 80;   // chamadas de script por cliente por segundo

function smoothPath(pts: [number,number][]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i-1], c = pts[i], mx = (p[0]+c[0])/2;
    d += ` C${mx.toFixed(1)},${p[1].toFixed(1)} ${mx.toFixed(1)},${c[1].toFixed(1)} ${c[0].toFixed(1)},${c[1].toFixed(1)}`;
  }
  return d;
}

function toPoints(data: number[], W: number, H: number, pX: number, pY: number, yMax: number): [number,number][] {
  return data.map((v,i) => [
    pX + (i/(data.length-1))*(W-pX*2),
    pY + (H-pY*2) - (v/yMax)*(H-pY*2),
  ]);
}

export default function RedeAnalise() {
  const [tick, setTick] = useState(0);
  const [plcAtivo, setPlcAtivo] = useState<string|null>(null);
  const [tooltip, setTooltip] = useState<{x:number;y:number;plc:string;val:string}|null>(null);

  useEffect(() => {
    const t = setInterval(() => setTick(v => (v+1)%30), 1000);
    return () => clearInterval(t);
  }, []);

  // Calculos reais derivados dos parametros
  const totalTags       = PLCS.reduce((s,p) => s+p.tags, 0);             // 5000
  const tagTrafficKBs   = (totalTags * TAG_BYTES) / 1024;                 // ~97 KB/s
  const clientsTrafficMBs = (tagTrafficKBs * CLIENTS) / 1024;             // ~0.95 MB/s
  const sqlWritesS      = totalTags;                                       // 5000 writes/s
  const worstRtt        = Math.max(...PLCS.map(p => p.rttMax));           // 47ms
  // IEC 104: throughput max = k * APDU / RTT
  const iec104TpBest    = Math.round(IEC104_K * IEC104_APDU_B / (8/1000));    // RTT 8ms
  const iec104TpWorst   = Math.round(IEC104_K * IEC104_APDU_B / (worstRtt/1000)); // RTT 47ms
  // thread time DCOM por segundo: clients * calls/s * (RTT + overhead)
  const threadTimeS     = Math.round((CLIENTS * SCRIPT_CALLS_S * (worstRtt + DCOM_OVERHEAD)));  // ms

  const W=560, H=180, pX=36, pY=14;

  function janela(arr: number[]) {
    return Array.from({length:16}, (_,i) => arr[(tick+i)%30]);
  }

  const graficoPLCS = PLCS.map(p => {
    const dados = janela(p.lat);
    const pts = toPoints(dados, W, H, pX, pY, 55);
    const line = smoothPath(pts);
    const area = line+` L${pts[pts.length-1][0].toFixed(1)},${(H-pY).toFixed(1)} L${pts[0][0].toFixed(1)},${(H-pY).toFixed(1)} Z`;
    const ativo = plcAtivo===null || plcAtivo===p.id;
    return { p, dados, pts, line, area, ativo };
  });

  // Calculo do delay acumulado actual (ultimo tick)
  const delayAtual = Math.round(PLCS.reduce((s,p) => s + janela(p.lat).slice(-1)[0], 0));

  const metrics = [
    { label:"Total tags",          val:`${totalTags.toLocaleString()}`,          unit:"tags",    cor:C.blue },
    { label:"Tráfego IEC 104",     val:tagTrafficKBs.toFixed(0),                 unit:"KB/s",    cor:"#D97706" },
    { label:"Tráfego 10 clientes", val:clientsTrafficMBs.toFixed(2),             unit:"MB/s",    cor:"#7C3AED" },
    { label:"SQL writes",          val:`${sqlWritesS.toLocaleString()}`,          unit:"/s",      cor:C.red },
    { label:"IEC 104 throughput",  val:`${(iec104TpWorst/1024).toFixed(0)}–${(iec104TpBest/1024).toFixed(0)}`, unit:"KB/s",  cor:C.green },
    { label:"Thread time DCOM",    val:threadTimeS.toLocaleString(),              unit:"ms/s",    cor:C.red },
  ];

  return (
    <div style={{ fontFamily:"'Mulish', sans-serif", color:C.ink }}>

      {/* Header */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontFamily:"'Gloria Hallelujah', cursive", fontSize:9, opacity:0.5, marginBottom:3 }}>
          sistema actual · cenário real · 5 PLCs × 1 000 tags × 10 clientes
        </div>
        <div style={{ fontFamily:"'Caveat', cursive", fontWeight:700, fontSize:34, lineHeight:1 }}>
          Rede & <span style={{ color:C.red }}>Latência</span>
          <span style={{ fontFamily:"'Kalam', cursive", fontSize:14, fontWeight:700, opacity:0.45, marginLeft:14 }}>
            IEC 104 · DCOM · WinCC Server · gargalos reais
          </span>
        </div>
        <div style={{ height:2, background:C.red, opacity:0.6, borderRadius:2, marginTop:8, width:"30%" }} />
      </div>

      {/* Pills de metricas reais */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:18 }}>
        {metrics.map(m => (
          <div key={m.label} style={{
            border:`1.5px solid ${m.cor}`, borderRadius:"14px 10px 16px 8px",
            background:m.cor+"12", padding:"4px 12px",
            boxShadow:`2px 2px 0 ${C.ink}`,
          }}>
            <div style={{ fontFamily:"'Gloria Hallelujah', cursive", fontSize:8, opacity:0.55 }}>{m.label}</div>
            <div style={{ fontFamily:"'Caveat', cursive", fontWeight:700, fontSize:18, color:m.cor, lineHeight:1 }}>
              {m.val} <span style={{ fontSize:11, fontFamily:"'Kalam', cursive", opacity:0.7 }}>{m.unit}</span>
            </div>
          </div>
        ))}
        {/* Delay acumulado animado */}
        <div style={{
          border:`2px solid ${delayAtual > 150 ? C.red : "#D97706"}`,
          borderRadius:"14px 10px 16px 8px",
          background:(delayAtual > 150 ? C.red : "#D97706")+"18",
          padding:"4px 12px",
          boxShadow:`2px 2px 0 ${C.ink}`,
          marginLeft:"auto",
        }}>
          <div style={{ fontFamily:"'Gloria Hallelujah', cursive", fontSize:8, opacity:0.55 }}>delay acumulado (agora)</div>
          <div style={{ fontFamily:"'Caveat', cursive", fontWeight:700, fontSize:18, color:delayAtual>150?C.red:"#D97706", lineHeight:1 }}>
            {delayAtual} <span style={{ fontSize:11, fontFamily:"'Kalam', cursive", opacity:0.7 }}>ms</span>
          </div>
        </div>
      </div>

      {/* Layout principal: grafico esquerda + analise direita */}
      <div style={{ display:"grid", gridTemplateColumns:"520px 1fr", gap:20, alignItems:"start" }}>

        {/* ESQUERDA: grafico compacto */}
        <div>
          <div style={{ fontFamily:"'Caveat', cursive", fontWeight:700, fontSize:16, marginBottom:8 }}>
            RTT IEC 104 por VLAN — últimos 16s
            <span style={{ fontFamily:"'Gloria Hallelujah', cursive", fontSize:9, fontWeight:400, opacity:0.4, marginLeft:8 }}>live</span>
          </div>

          {/* legenda inline */}
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
            {PLCS.map(p => (
              <button key={p.id} onClick={() => setPlcAtivo(plcAtivo===p.id ? null : p.id)} style={{
                fontFamily:"'Kalam', cursive", fontWeight:700, fontSize:10,
                display:"flex", alignItems:"center", gap:4,
                padding:"2px 8px", cursor:"pointer",
                border:`1.5px solid ${plcAtivo===p.id ? p.cor : C.ink}`,
                borderRadius:"12px 8px 14px 6px",
                background: plcAtivo===p.id ? p.cor+"18" : C.paper,
                color: plcAtivo===p.id ? p.cor : C.ink,
                boxShadow:`1px 1px 0 ${C.ink}`,
              }}>
                <span style={{ width:12, height:2.5, borderRadius:1, background:p.cor, display:"inline-block" }} />
                {p.id} <span style={{ opacity:0.4, fontSize:9 }}>{p.vlan}</span>
              </button>
            ))}
          </div>

          <div style={{ border:`2px solid ${C.ink}`, borderRadius:"10px 12px 8px 14px", background:C.paper, boxShadow:`4px 4px 0 ${C.ink}`, overflow:"hidden", position:"relative" }}>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display:"block" }} onMouseLeave={() => setTooltip(null)}>
              <defs>
                {PLCS.map(p => (
                  <linearGradient key={p.id} id={`g-${p.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={p.cor} stopOpacity="0.12"/>
                    <stop offset="100%" stopColor={p.cor} stopOpacity="0"/>
                  </linearGradient>
                ))}
              </defs>
              <rect width={W} height={H} fill={C.paper}/>
              {/* grid */}
              {[10,20,30,40,50].map(v => {
                const y = pY+(H-pY*2)-(v/55)*(H-pY*2);
                return <g key={v}>
                  <line x1={pX} y1={y} x2={W-4} y2={y} stroke={C.ink} strokeWidth="0.4" strokeDasharray="4 4" opacity="0.15"/>
                  <text x={pX-4} y={y+3} fill={C.ink} fontSize="8" textAnchor="end" fontFamily="Kalam,cursive" opacity="0.4">{v}</text>
                </g>;
              })}
              {/* limiar 30ms */}
              {(() => { const y=pY+(H-pY*2)-(30/55)*(H-pY*2); return <>
                <line x1={pX} y1={y} x2={W-4} y2={y} stroke={C.red} strokeWidth="1.2" strokeDasharray="5 3" opacity="0.6"/>
                <text x={W-6} y={y-3} fill={C.red} fontSize="7.5" fontFamily="'Gloria Hallelujah',cursive" textAnchor="end" opacity="0.75">30ms crítico</text>
              </>; })()}
              {/* linhas PLCs */}
              {graficoPLCS.map(({ p, dados, pts, line, area, ativo }) => (
                <g key={p.id} style={{ opacity:ativo?1:0.06, transition:"opacity .2s" }}>
                  <path d={area} fill={`url(#g-${p.id})`}/>
                  <path d={line} fill="none" stroke={p.cor} strokeWidth={ativo?2:1} strokeLinecap="round"/>
                  {pts.map(([x,y],i) => (
                    <circle key={i} cx={x} cy={y} r={ativo?3:1.5}
                      fill={p.cor} stroke={C.paper} strokeWidth="1.2"
                      style={{ cursor:"pointer" }}
                      onMouseEnter={e => {
                        const r=(e.target as SVGCircleElement).closest("svg")!.getBoundingClientRect();
                        setTooltip({ x:e.clientX-r.left, y:e.clientY-r.top-14, plc:p.id, val:`${dados[i]}ms` });
                      }}
                    />
                  ))}
                </g>
              ))}
              {/* eixo X */}
              {[0,4,8,12,15].map(i => (
                <text key={i} x={pX+(i/15)*(W-pX-4)} y={H-3} fill={C.ink} fontSize="7.5"
                  fontFamily="'Kalam',cursive" textAnchor="middle" opacity="0.3">-{16-i}s</text>
              ))}
            </svg>
            {tooltip && (
              <div style={{
                position:"absolute", left:tooltip.x+8, top:tooltip.y,
                background:C.navy, color:"white", borderRadius:6,
                padding:"4px 10px", fontSize:11, fontFamily:"'Kalam',cursive", fontWeight:700,
                boxShadow:`2px 2px 0 ${C.ink}`, pointerEvents:"none",
                border:`1.5px solid ${C.ink}`,
              }}>
                <div style={{ color:PLCS.find(p=>p.id===tooltip.plc)?.cor, fontSize:10 }}>{tooltip.plc}</div>
                <div>{tooltip.val}</div>
              </div>
            )}
          </div>

          {/* Tabela RTT por PLC */}
          <div style={{ marginTop:12, border:`2px solid ${C.ink}`, borderRadius:"8px 10px 6px 12px", overflow:"hidden", boxShadow:`3px 3px 0 ${C.ink}` }}>
            <div style={{ display:"grid", gridTemplateColumns:"80px 70px 70px 1fr", background:C.navy }}>
              {["PLC","RTT min","RTT max","Throughput máx IEC 104"].map(h => (
                <div key={h} style={{ fontFamily:"'Gloria Hallelujah',cursive", fontSize:8, color:"rgba(255,255,255,0.55)", padding:"5px 10px" }}>{h}</div>
              ))}
            </div>
            {PLCS.map((p,i) => {
              const tp = Math.round(IEC104_K * IEC104_APDU_B / (p.rttMax/1000) / 1024);
              const kbNeeded = Math.round(p.tags * TAG_BYTES / 1024);
              const ok = tp >= kbNeeded;
              return (
                <div key={p.id} style={{
                  display:"grid", gridTemplateColumns:"80px 70px 70px 1fr",
                  background: i%2===0 ? C.paper : C.paper2,
                  borderTop:`1px solid ${C.ink}22`,
                }}>
                  <div style={{ fontFamily:"'Caveat',cursive", fontWeight:700, fontSize:15, color:p.cor, padding:"4px 10px" }}>{p.id}</div>
                  <div style={{ fontFamily:"'Kalam',cursive", fontSize:12, padding:"4px 10px", opacity:0.7 }}>{p.rttMin}ms</div>
                  <div style={{ fontFamily:"'Kalam',cursive", fontSize:12, padding:"4px 10px", color:p.rttMax>=30?C.red:"#D97706", fontWeight:700 }}>{p.rttMax}ms</div>
                  <div style={{ fontFamily:"'Kalam',cursive", fontSize:11, padding:"4px 10px" }}>
                    <span style={{ color: ok ? C.green : C.red, fontWeight:700 }}>{tp} KB/s</span>
                    <span style={{ opacity:0.45, marginLeft:6 }}>({kbNeeded} KB/s necessários · {ok?"OK":"⚠ RISCO"})</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* DIREITA: analise do cenario real */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

          {/* Titulo */}
          <div style={{ fontFamily:"'Caveat',cursive", fontWeight:700, fontSize:18, borderBottom:`1.5px dashed ${C.ink}`, paddingBottom:6, opacity:0.7 }}>
            O que realmente acontece no servidor
          </div>

          {/* Item 1: Camada de campo */}
          <div style={{ border:`2px solid ${C.blue}`, borderRadius:"10px 14px 8px 12px", padding:"12px 14px", background:C.paper, boxShadow:`2px 2px 0 ${C.ink}` }}>
            <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}>
              <div style={{ width:22, height:22, border:`2px solid ${C.blue}`, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Caveat',cursive", fontWeight:700, fontSize:13, color:C.blue, flexShrink:0 }}>1</div>
              <div style={{ fontFamily:"'Caveat',cursive", fontWeight:700, fontSize:17, color:C.blue }}>Camada de Campo — 5 000 tags por ciclo</div>
            </div>
            <p style={{ fontFamily:"'Mulish',sans-serif", fontSize:12, lineHeight:1.55, margin:0 }}>
              Cada PLC envia <b>1 000 tags × ~20 bytes = 20 KB/ciclo</b> via IEC 104.
              Com polling de 1s, cada ligação gera <b>20 KB/s</b> de dados.
              Os 5 PLCs juntos produzem <b>~97 KB/s</b> chegando ao WinCC Server em simultâneo.
              O IEC 104 garante entrega por confirmação de sequência (parâmetro <b>k=12</b>),
              mas com RTT de 47ms na VLAN 50, a janela k esgota-se <b>mais rapidamente</b>,
              forçando pausas no envio e criando picos de tags em atraso.
            </p>
          </div>

          {/* Item 2: WinCC Server SQL */}
          <div style={{ border:`2px solid ${C.red}`, borderRadius:"10px 14px 8px 12px", padding:"12px 14px", background:C.paper, boxShadow:`2px 2px 0 ${C.ink}` }}>
            <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}>
              <div style={{ width:22, height:22, border:`2px solid ${C.red}`, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Caveat',cursive", fontWeight:700, fontSize:13, color:C.red, flexShrink:0 }}>2</div>
              <div style={{ fontFamily:"'Caveat',cursive", fontWeight:700, fontSize:17, color:C.red }}>WinCC Server — {sqlWritesS.toLocaleString()} escritas SQL/s</div>
            </div>
            <p style={{ fontFamily:"'Mulish',sans-serif", fontSize:12, lineHeight:1.55, margin:0 }}>
              Cada tag recebida é escrita no <b>SQL Server local</b> (mesma VM). Com 5 000 tags a actualizar por segundo,
              o SQL Server processa <b>5 000 INSERT/UPDATE por segundo</b> enquanto
              o próprio WinCC executa os Global Scripts e mantém as 5 ligações IEC 104 abertas.
              A contenção de CPU e I/O de disco numa única VM ESXi é o <b>primeiro gargalo real</b>:
              quando o SQL satura, os scripts esperam, e os clientes vêem dados congelados.
            </p>
          </div>

          {/* Item 3: DCOM 10 clientes */}
          <div style={{ border:`2px solid #D97706`, borderRadius:"10px 14px 8px 12px", padding:"12px 14px", background:C.paper, boxShadow:`2px 2px 0 ${C.ink}` }}>
            <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}>
              <div style={{ width:22, height:22, border:`2px solid #D97706`, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Caveat',cursive", fontWeight:700, fontSize:13, color:"#D97706", flexShrink:0 }}>3</div>
              <div style={{ fontFamily:"'Caveat',cursive", fontWeight:700, fontSize:17, color:"#D97706" }}>DCOM — {CLIENTS} clientes · {threadTimeS.toLocaleString()} ms de thread/s</div>
            </div>
            <p style={{ fontFamily:"'Mulish',sans-serif", fontSize:12, lineHeight:1.55, margin:0 }}>
              Cada WinCC Client faz <b>~{SCRIPT_CALLS_S} chamadas de script por segundo</b> via DCOM.
              Com 10 clientes: <b>{CLIENTS*SCRIPT_CALLS_S} chamadas/s</b>. Cada chamada inclui
              overhead DCOM de ~{DCOM_OVERHEAD}ms + RTT do PLC (até 47ms) = <b>~51ms por chamada</b>.
              Resultado: o servidor precisa de gerir <b>{threadTimeS.toLocaleString()} ms de trabalho de thread por segundo</b> —
              mais do que 1 segundo real de CPU. Com o pool de threads padrão do WinCC (~10–20 threads),
              a fila acumula e scripts começam a falhar com <b>timeout DCOM (30s)</b>.
            </p>
          </div>

          {/* Item 4: Simatic Shell */}
          <div style={{ border:`2px solid #7C3AED`, borderRadius:"10px 14px 8px 12px", padding:"12px 14px", background:C.paper, boxShadow:`2px 2px 0 ${C.ink}` }}>
            <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}>
              <div style={{ width:22, height:22, border:`2px solid #7C3AED`, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Caveat',cursive", fontWeight:700, fontSize:13, color:"#7C3AED", flexShrink:0 }}>4</div>
              <div style={{ fontFamily:"'Caveat',cursive", fontWeight:700, fontSize:17, color:"#7C3AED" }}>Simatic Shell — espelha um servidor já sobrecarregado</div>
            </div>
            <p style={{ fontFamily:"'Mulish',sans-serif", fontSize:12, lineHeight:1.55, margin:0 }}>
              O Simatic Shell distribui o ecrã WinCC pelos {CLIENTS} clientes via <b>NetDDE/RPC</b>.
              Se o WinCC Server está a processar {sqlWritesS.toLocaleString()} escritas SQL + {CLIENTS*SCRIPT_CALLS_S} chamadas DCOM,
              o Simatic Shell encontra o servidor com <b>CPU saturada</b> e a resposta ao pedido de
              actualização de ecrã demora ou falha completamente. O operador no posto vê o
              supervisório <b>congelar ou mostrar valores antigos</b> sem qualquer aviso.
            </p>
          </div>

        </div>
      </div>

      {/* Divisor */}
      <div style={{
        height:12, margin:"18px 0 16px",
        backgroundImage:`url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 12'><path d='M0 6 L8 2 L16 8 L24 4 L32 8 L40 2 L48 8 L56 4 L64 8 L72 2 L80 8 L88 4 L96 8 L104 2 L112 8 L120 4 L128 8 L136 2 L144 8 L152 4 L160 8 L168 2 L176 8 L184 4 L192 8 L200 4' stroke='%231a1a1a' stroke-width='1.5' fill='none'/></svg>")`,
        backgroundRepeat:"repeat-x", opacity:0.2,
      }}/>

      {/* Tabela de carga real */}
      <div style={{ fontFamily:"'Caveat',cursive", fontWeight:700, fontSize:20, marginBottom:10 }}>
        Carga real no servidor — cenário de pico (10 clientes activos)
      </div>
      <div style={{ border:`2.5px solid ${C.ink}`, borderRadius:"12px 14px 10px 16px", overflow:"hidden", boxShadow:`4px 4px 0 ${C.ink}` }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", background:C.navy }}>
          {["Origem","Operação","Carga/s","Impacto"].map(h => (
            <div key={h} style={{ fontFamily:"'Gloria Hallelujah',cursive", fontSize:9, color:"rgba(255,255,255,0.55)", padding:"7px 12px" }}>{h}</div>
          ))}
        </div>
        {[
          { origem:"5 PLCs IEC 104",      op:"Recepção de tags",       carga:`${totalTags.toLocaleString()} tags · ${tagTrafficKBs.toFixed(0)} KB`,    cor:C.blue,  impacto:"Baseline — normal", icor:C.green },
          { origem:"SQL Server (WinCC)",  op:"INSERT/UPDATE tags",     carga:`${sqlWritesS.toLocaleString()} escritas`,                                  cor:C.red,   impacto:"CPU+I/O alto — 1.ª falha", icor:C.red },
          { origem:"10 WinCC Clients",    op:"Leitura via DCOM",       carga:`${(CLIENTS*SCRIPT_CALLS_S).toLocaleString()} chamadas · ${clientsTrafficMBs.toFixed(2)} MB`, cor:"#7C3AED", impacto:"Thread pool saturado", icor:C.red },
          { origem:"Global Scripts",      op:"Exec. com RTT PLC",      carga:`até ${worstRtt}ms/chamada bloqueante`,                                    cor:"#D97706",impacto:"Fila cresce → timeout 30s", icor:C.red },
          { origem:"Simatic Shell",       op:"Espelho de ecrã NetDDE", carga:`${CLIENTS} sessões simultâneas`,                                          cor:"#7C3AED",impacto:"Congelamento no operador", icor:"#D97706" },
          { origem:"DCOM overhead",       op:"Marshal/unmarshal RPC",  carga:`${DCOM_OVERHEAD}ms × ${CLIENTS*SCRIPT_CALLS_S} = ${threadTimeS.toLocaleString()}ms`,    cor:C.red,   impacto:"Starvation de threads", icor:C.red },
        ].map((r,i) => (
          <div key={i} style={{
            display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr",
            background: i%2===0 ? C.paper : C.paper2,
            borderTop:`1.5px solid ${C.ink}22`,
          }}>
            <div style={{ fontFamily:"'Caveat',cursive", fontWeight:700, fontSize:15, color:r.cor, padding:"6px 12px" }}>{r.origem}</div>
            <div style={{ fontFamily:"'Mulish',sans-serif", fontSize:11, padding:"6px 12px", opacity:0.65 }}>{r.op}</div>
            <div style={{ fontFamily:"'Kalam',cursive", fontSize:12, padding:"6px 12px", fontWeight:700 }}>{r.carga}</div>
            <div style={{ fontFamily:"'Kalam',cursive", fontSize:12, padding:"6px 12px", color:r.icor, fontWeight:700 }}>{r.impacto}</div>
          </div>
        ))}
      </div>

    </div>
  );
}
