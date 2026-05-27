# Checklist de Validação — Gestão de Acesso EDP Eclusas
**Projecto:** Controlo de Acesso Remoto — Eclusas WinCC  
**Última atualização:** 2026-05-27

## Arquitectura
```
[PC Operador — Tauri Desktop]
        ↕ SSE + REST (JWT)
[Backend Rust/Axum :8080 — Docker Ubuntu .12] ── PostgreSQL
        ↕ SSH (netsh / tsdiscon / qwinsta)
[WinServer RG .13]        ── wincc-agent → heartbeat + wincc_vivo
[WinServer PN .14]        ── wincc-agent → heartbeat + wincc_vivo
[WinServer Reserva01 .15] ── wincc-agent → heartbeat + wincc_vivo
[WinServer Reserva02 .16] ── wincc-agent → heartbeat + wincc_vivo
[WinServer Reserva03 .17] ── wincc-agent → heartbeat + wincc_vivo
[WinServer CL .18]        ── wincc-agent → heartbeat + wincc_vivo
[WinServer CM .19]        ── wincc-agent → heartbeat + wincc_vivo
[WinServer VR .20]        ── wincc-agent → heartbeat + wincc_vivo
```

---

## BLOCO A — BLOQUEIO DE ACESSO / SEGURANÇA

### O que o sistema entrega hoje ✅

| # | Funcionalidade |
|---|---------------|
| A1 | Acesso RDP não autorizado → expulsão automática via `tsdiscon` (SSH ao servidor) |
| A2 | IP do PC intruso obtido via `netstat` **antes** do tsdiscon (garante captura mesmo após CLOSE_WAIT) |
| A3 | IP bloqueado no firewall `netsh advfirewall` em **todos** os servidores (RG, PN, Reserva01/02/03) |
| A4 | IP bloqueado registado na tabela `ip_blacklist` (PostgreSQL) com servidor alvo + utilizador usado |
| A5 | HashSet `em_expulsao` — sem expulsões duplicadas por ciclo de polling |
| A6 | Período de graça no arranque — sem expulsões nos primeiros segundos após deploy |
| A7 | Admin pode desbloquear IP manualmente pela interface Blacklist |
| A8 | Admin pode autorizar RDP directo temporário (`/admin/rdp-direto`, válido 10 min) |
| A9 | Limpeza de todos os bloqueios de firewall no arranque do backend (estado limpo após restart) |
| A10 | **Login com credenciais válidas desbloqueia IP automaticamente** em todos os servidores + DB |
| A11 | Logs de auditoria: bloqueio, desbloqueio, expulsão registados em PostgreSQL com IP e timestamp |
| A12 | Tempo de detecção e bloqueio: < 3 segundos após ligação não autorizada |
| A13 | Dashboard blacklist reflecte desbloqueio em tempo real (poll 3s, sem cache stale) |

### O que falta fazer ❌

| # | Tarefa | Prioridade |
|---|--------|-----------|
| A14 | Expiração automática de entradas na blacklist (ex: 24h) | Média |
| A15 | Rate limiting no `/auth/login` — proteção brute-force | Alta |
| A16 | Notificação SSE específica no dashboard quando IP é bloqueado | Baixa |

---

## BLOCO B — FAILOVER RDP (Principal → Reserva → Retorno)

### O que o sistema entrega hoje ✅

| # | Funcionalidade |
|---|---------------|
| B1 | Watchdog deteta queda: heartbeat parado >5s **ou** `wincc_vivo=false` |
| B2 | Seleção automática de reserva por prioridade: Reserva01 → Reserva02 → Reserva03 |
| B3 | Failover só dispara se reserva tem `windows_vivo=true` **e** `wincc_vivo=true` |
| B4 | SSE `failover` enviado ao frontend com IP e ID do reserva escolhido |
| B5 | Frontend fecha mstsc atual e abre no reserva **sem qualquer intervenção do operador** |
| B6 | `SUPRIMIR_DESCONECTADO` (AtomicBool Rust + useRef React) — impede que fecho de mstsc durante transição limpe sessão |
| B7 | Sessão registada no backend com `ip_servidor=reserva` durante failover |
| B8 | `failover_ips` no AppState — `rdp_poll_loop` monitoriza reserva em vez do servidor offline |
| B9 | `servidores_poll_loop` isenta IPs em `failover_ips` de expulsão (operador legítimo no reserva) |
| B10 | `rdp_poll_loop` protege sessão de auto-limpeza quando `em_failover=true` |
| B11 | Badge "Via ReservaXX" no card quando operador está em failover |
| B12 | Timeout de segurança 30s: se frontend não confirmar retorno, `failover_ips` limpa automaticamente |
| B13 | SSE `servidor_voltou` inclui campo `operador` — só o PC do operador correto reconecta |
| B14 | Retorno automático ao servidor original implementado (`handleVoltarOriginal`) |
| B15 | `/sessoes/iniciar` aceita retomada pelo mesmo operador (sem rejeitar por "eclusa ocupada") |

### O que falta fazer ❌

| # | Tarefa | Prioridade |
|---|--------|-----------|
| B16 | **Navegação automática WinCC Reserva no failover** — enviar string eclusa ao wincc-agent para abrir página correcta | Alta |
| B17 | **Teste de retorno automático em produção** — aguarda `wincc-agent` como serviço Windows | Alta |
| B18 | Estado de failover persistido em PostgreSQL — backend reiniciado durante failover perde `failover_ips` | Alta |
| B19 | Failover para CL, CM, VR (atualmente só RG e PN têm failover completo implementado) | Alta |
| B20 | Failover em cadeia: Reserva01 cai durante uso → move automaticamente para Reserva02 | Média |
| B21 | Dialog de confirmação opcional: "Servidor RG voltou — voltar ao principal?" | Baixa |

---

## BLOCO C — CONTROLO DE ACESSO RDP (Geral)

### O que o sistema entrega hoje ✅

| # | Funcionalidade |
|---|---------------|
| C1 | Autenticação JWT (argon2id) — roles admin / operador |
| C2 | Sessão RDP registada no backend ao clicar "Aceder Eclusa" |
| C3 | Apenas um operador por eclusa em simultâneo (check-and-set atómico) |
| C4 | Um operador não pode ter sessão em RG e PN ao mesmo tempo |
| C5 | `mstsc /admin` — nunca cria sessões paralelas, sempre reconecta à sessão consola |
| C6 | Encerrar sessão própria — mstsc fecha → sessão limpa no backend automaticamente |
| C7 | Encerrar sessão forçado — admin pode terminar sessão de qualquer operador |
| C8 | Auto-limpeza de sessão presa — RDP livre há >30s com sessão marcada → limpa automaticamente |
| C9 | Supervisão shadow RDP — admin vê ecrã do operador sem interagir (view-only, sem consentimento) |
| C10 | Múltiplos supervisores simultâneos por eclusa |
| C11 | SSE — dashboard atualiza em tempo real sem polling manual |
| C12 | Dashboard: 5 cards de acesso RDP (IND1, IND2, RG, IND4, PN) |
| C13 | Dashboard: monitorização estado PLC + eclusas WinCC |
| C14 | Admin sidebar: utilizadores (CRUD), logs de auditoria, blacklist, servidores |
| C15 | Página Servidores: visão geral `windows_vivo` + `wincc_vivo` + sessões ativas em tempo real |
| C16 | Token JWT 24h (sem expiração durante turno) |
| C17 | Sessão única RDP por servidor — sem dialog "Select a session to reconnect to" |
| C18 | Logoff automático de sessões Disconnected após 1 minuto (MaxDisconnectionTime) |
| C19 | Políticas RDP aplicadas automaticamente via SSH no arranque do backend (todos os servidores) |
| C20 | Encerrar sessão via botão WinCC (`Encerrar_Sessao` bit → wincc-agent → backend → SSE → mstsc fecha silenciosamente) |

### O que falta fazer ❌

| # | Tarefa | Prioridade |
|---|--------|-----------|
| C21 | `wincc-agent` instalado e a correr como serviço Windows (auto-start) em **todos** os 8 servidores | Alta |
| C22 | WinCC Global Script (VBScript) configurado em CL, CM, VR | Alta |
| C23 | Rate limiting / timeout de sessão (encerrar após X horas sem atividade) | Média |
| C24 | Renovação silenciosa de tokens JWT no frontend | Média |
| C25 | Relatório de acessos exportável CSV | Baixa |
| C26 | Configuração de IPs via UI (sem editar config.json) | Baixa |

---

## BLOCO D — INFRAESTRUTURA / DEPLOY

### O que o sistema entrega hoje ✅

| # | Funcionalidade |
|---|---------------|
| D1 | Backend Rust/Axum em Docker (Ubuntu 24.04, multi-stage com cargo-chef) |
| D2 | PostgreSQL via sqlx com pool (25 conexões máx) |
| D3 | `deploy.ps1` — copia código via SCP + `docker build --no-cache` + restart automatizado |
| D4 | Health check automático após cada deploy |
| D5 | Graceful shutdown (SIGTERM + Ctrl+C) + auto-restart do container (`--restart unless-stopped`) |
| D6 | Repositório GitHub com histórico completo de versões |

### O que falta fazer ❌

| # | Tarefa | Prioridade |
|---|--------|-----------|
| D7 | CI/CD: git push → deploy automático no servidor (atualmente manual via `deploy.ps1`) | Média |
| D8 | Backup automático do PostgreSQL | Alta |
| D9 | Monitorização de logs centralizada | Baixa |
| D10 | Ambiente de staging separado de produção | Baixa |

---

## Assinaturas de Aprovação

| Papel | Nome | Data | Aprovação |
|-------|------|------|-----------|
| Responsável Técnico EDP | | | ☐ Aprovado |
| Responsável Segurança EDP | | | ☐ Aprovado |
| Desenvolvedor | Danilo Henrique Silva Lira | 2026-05-26 | ✅ |

---
*Sistema de Gestão de Acesso EDP — Controlo de Eclusas WinCC*
