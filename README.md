# Sistema de Gestão de Acesso Remoto — EDP Eclusas

Backend **Rust/Axum** · Frontend **Tauri v2 / React / Tailwind** · DB **PostgreSQL 16** · Acesso remoto **Windows Server 2022 nativo (RDP/WTS)**

> **Importante:** Este sistema usa exclusivamente as ferramentas nativas do Windows Server 2022 para gestão de sessões RDP:
> `qwinsta` (listar sessões), `tsdiscon` (desconectar sessão), `mstsc` (abrir cliente RDP), **WTS API** (obter IP do cliente via `WTSQuerySessionInformationW`) e **PowerShell `netsh`/`New-NetFirewallRule`** (firewall). **Não usa RustDesk nem qualquer software de acesso remoto de terceiros.**

---

## Visão Geral

O sistema gere o acesso remoto RDP dos operadores EDP às Estações WinCC que controlam as eclusas do Douro (CL, CM, PN, RG, VR). Garante que apenas um operador por vez acede a cada eclusa, regista toda a actividade em auditoria, permite supervisão view-only em shadow mode, e monitoriza a saúde dos PLCs via TCP.

```
                    ┌─────────────────────────────────────┐
                    │         Servidor Linux               │
                    │  ┌─────────────┐  ┌──────────────┐  │
  Tauri Desktop ───►│  │  Rust API   │  │  PostgreSQL  │  │
  React Frontend    │  │  Axum 0.7   │──│     16       │  │
  Browser Dashboard │  └──────┬──────┘  └──────────────┘  │
                    └─────────┼───────────────────────────┘
                              │ WinCC API / RDP Commands
                    ┌─────────▼───────────────────────────┐
                    │     Windows Server 2022 (VMs)        │
                    │  cliente1: RG (172.29.164.49)         │
                    │  cliente2: PN (172.29.164.51)         │
                    └──────────────────────────────────────┘
```

---

## Stack Técnica

| Componente | Tecnologia |
|---|---|
| Backend | Rust 2021 + Axum 0.7 + Tokio |
| Autenticação | JWT HS256 + Argon2id |
| Base de dados | PostgreSQL 16 + sqlx 0.8 |
| Frontend desktop | Tauri v2 + React + TypeScript + Tailwind CSS |
| Sessões RDP | `qwinsta`, `tsdiscon`, WTS API (Windows Server 2022) |
| Shadow/supervisão | `mstsc /shadow` + registo de políticas via PowerShell |
| Firewall | `New-NetFirewallRule` via WMIC remoto |
| Monitorização PLC | TCP probe na porta 102 (S7 / ISO-on-TCP) |
| Deploy | Docker Compose (Linux) + `deploy.ps1` (PuTTY, Windows) |

---

## Arranque Rápido

### Pré-requisitos (servidor Linux)
- Docker + Docker Compose v2
- Portas: `8080` (API)

### 1. Configurar variáveis de ambiente

```bash
cp infra/.env.server.example infra/.env.server
# Editar com os valores reais:
# POSTGRES_PASSWORD, JWT_SECRET, RDP_PASSWORD
```

### 2. Subir os serviços

```bash
cd infra
docker compose up -d --build
docker compose logs -f api
```

### 3. Verificar saúde

```bash
curl http://localhost:8080/health
# {"status":"ok","db":true,"plc":false,"timestamp":"..."}
```

### 4. Bootstrap do admin (primeira vez)

Definir `BOOTSTRAP_ADMIN_PASSWORD` em `.env.server` antes do primeiro arranque.
O utilizador `admin` é criado automaticamente se não existir nenhum admin activo.

---

## Deploy automático (Windows → Servidor Linux)

```powershell
# Copia ficheiros + rebuild Docker no servidor
.\deploy.ps1

# Só rebuild sem copiar ficheiros
.\deploy.ps1 -SoBackend

# Rebuild + ver logs depois
.\deploy.ps1 -VerLogs
```

Usa PuTTY (`plink`/`pscp`) — instalar em `C:\Program Files\PuTTY\`.

---

## Variáveis de Ambiente

| Variável | Obrigatório | Descrição |
|---|---|---|
| `DATABASE_URL` | Sim | URL PostgreSQL |
| `JWT_SECRET` | Sim | Segredo JWT (mínimo 32 chars) |
| `RDP_PASSWORD` | Sim | Password do utilizador RDP nas VMs |
| `RDP_USER` | Não | Utilizador RDP (default: `Administrator`) |
| `API_PORT` | Não | Porta da API (default: `8080`) |
| `ECLUSAS_FILE` | Não | Caminho do ficheiro de estado das eclusas |
| `CLIENT1_IP` | Não | IP da VM cliente1/RG (default: `172.29.164.49`) |
| `CLIENT2_IP` | Não | IP da VM cliente2/PN (default: `172.29.164.51`) |
| `BOOTSTRAP_ADMIN_PASSWORD` | Não | Cria utilizador admin no primeiro arranque |
| `RUST_LOG` | Não | Nível de log (ex: `wincc_api=debug`) |

---

## API — Endpoints

### Públicos (sem autenticação)

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/health` | Saúde do serviço + DB |
| POST | `/auth/login` | Autenticação → retorna JWT |
| POST | `/auth/logout` | Revogação do token JWT |
| GET | `/eventos` | SSE stream — estado em tempo real |

### Eclusas (sem auth — LAN only, escritos pelo WinCC)

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/eclusas` | Estado de todas as eclusas |
| POST | `/eclusas/:id/estado` | WinCC actualiza estado da eclusa |

### Sessões RDP (requer JWT)

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/estado` | Estado global completo |
| GET | `/sessoes` | Estado das sessões activas |
| GET | `/sessoes/simples` | Formato texto para VBScript WinCC |
| GET | `/sessoes/shadow` | IDs/IPs para shadow mode |
| POST | `/sessoes/iniciar` | Inicia sessão RDP |
| POST | `/sessoes/encerrar` | Encerra sessão RDP |
| POST | `/supervisao/iniciar` | Regista supervisor (shadow view-only) |
| POST | `/supervisao/encerrar` | Remove supervisor |

### Streaming de vídeo (sem auth — LAN only)

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/stream/:cliente/frame` | WinCC Streamer envia frame JPEG |
| GET | `/stream/:cliente/mjpeg` | MJPEG multipart para browsers |
| GET | `/stream/:cliente/ws` | WebSocket binário (Tauri) |

### Administração (requer JWT admin)

| Método | Endpoint | Descrição |
|---|---|---|
| GET/POST | `/usuarios` | Listar/criar utilizadores |
| GET/PUT/DELETE | `/usuarios/:username` | Ler/actualizar/eliminar utilizador |
| GET/DELETE | `/operadores`, `/operadores/:nome` | Gestão de operadores |
| GET | `/logs` | Últimos 500 eventos de auditoria |
| GET/POST | `/blacklist` | Listar/adicionar IP bloqueado |
| DELETE | `/blacklist/:id` | Remover bloqueio de IP |
| POST | `/admin/force-logout` | Forçar logout de qualquer utilizador |

---

## Arquitectura Interna

### Estado em memória (`AppStateInner`)

Todo o estado mutável vive num `RwLock<AppStateInner>` — reads são concorrentes, writes são curtos:

- `sessoes` — quem está ligado a cada cliente RDP
- `supervisoes` — lista de supervisores activos por cliente
- `rdp` — estado actual de cada sessão Windows (qwinsta)
- `plc_health` — saúde de cada PLC com circuit breaker
- `eclusas` — estado JSON das eclusas (actualizado pelo WinCC, **sem I/O em runtime**)
- `operadores` — lista de operadores activos

### Background tasks

| Task | Intervalo | Função |
|---|---|---|
| `rdp_poll_loop` | 1500ms | Chama `qwinsta` em cada VM, desconecta sessões não autorizadas |
| `plc_health_loop` | 1000ms | Probe TCP porta 102 em 5 PLCs, circuit breaker |
| `failover_monitor_loop` | 2000ms | FSM watching PLC transitions → dispara failover (fase 2) |
| `cleanup_loop` | 1h | Limpa tokens expirados da DB e cache JTI em memória |

### Autenticação

- **JWT HS256** com JTI único por token (UUID v4)
- **Argon2id** para hash de passwords (via `spawn_blocking`)
- **Dupla revogação**: cache in-memory (`revoked_jtis`) + tabela PostgreSQL
  - Logout explícito → JTI adicionado ao cache e à DB instantaneamente
  - Próximas requests rejeitadas sem query à DB (cache first)
- **Force-logout admin** → timestamp threshold invalida todos os tokens anteriores

### Gestão RDP (Windows Server 2022)

```
Operador pede sessão → POST /sessoes/iniciar
  ├─ Verifica conta activa no PostgreSQL
  ├─ Verifica IP não bloqueado
  ├─ Write lock atómico (check-and-set)
  ├─ Desbloqueia IP no firewall em background (New-NetFirewallRule via WMIC)
  └─ Responde <10ms

Poll RDP (cada 1500ms) → qwinsta /server:<ip>
  ├─ Sessão activa + operador registado → OK
  ├─ Sessão activa + operador NÃO registado → tsdiscon + bloqueia IP
  └─ Sem sessão → limpa supervisores, broadcast SSE

Shadow/Supervisão → POST /supervisao/iniciar
  └─ Devolve sessao_id + server_ip para mstsc /shadow:<id> /server:<ip> /noConsentPrompt
```

---

## Desenvolvimento

### Compilar localmente

```bash
cd wincc-api
cp .env.example .env
# Editar .env com DATABASE_URL etc.

cargo build                    # debug
cargo build --release          # release

cargo run --bin seed           # popular DB com utilizadores de teste
```

### Variáveis de log

```bash
# Info (default)
RUST_LOG=wincc_api=info cargo run

# Debug (inclui queries sqlx)
RUST_LOG=wincc_api=debug,sqlx=debug cargo run

# Só warnings
RUST_LOG=warn cargo run
```

### Estrutura do projecto

```
wincc-api/
  src/
    main.rs           # entrypoint, router, middleware, graceful shutdown
    config.rs         # variáveis de ambiente, constantes de timing
    types.rs          # structs de domínio (Sessao, RdpInfo, PlcHealth, ...)
    state.rs          # AppState, AppStateInner, Shared
    auth.rs           # JWT, Argon2id, extractors AuthUser/AdminUser
    handlers/
      eclusas.rs      # GET/POST estado eclusas (memória + persist. disco)
      sessions.rs     # SSE, GET estado, iniciar/encerrar sessão RDP
      supervisao.rs   # shadow mode — listar/iniciar/encerrar supervisores
      users.rs        # auth login/logout, CRUD utilizadores, blacklist, force-logout
      misc.rs         # health, operadores, logs de auditoria
      stream.rs       # MJPEG multipart + WebSocket binário
    db/
      mod.rs          # pool, schema verify, bootstrap admin, cleanup_loop
      audit.rs        # log_evento, log_evento_com_ip, log_evento_bg
    rdp/
      mod.rs          # rdp_poll_loop, broadcast_estado, disconnect_unauthorized
      verify.rs       # qwinsta parse, WTSQuerySessionInformation (WTS API)
      firewall.rs     # New-NetFirewallRule via WMIC remoto
    plc/
      mod.rs          # plc_health_loop, circuit breaker
      health.rs       # CircuitBreaker (AtomicU32)
      connection.rs   # TCP probe porta 102
    failover/
      mod.rs          # FSM failover_monitor_loop
      orchestrator.rs # trigger_failover / revert_failover (fase 2 — TODO)
  bin/
    seed.rs           # ferramenta de desenvolvimento — cria utilizadores teste
```

---

## Notas de Segurança

- Endpoints `/eclusas`, `/stream`, `/sessoes/simples`, `/sessoes/shadow` não têm autenticação — devem estar acessíveis apenas na VLAN interna (firewall de rede)
- Passwords de RDP passam em variáveis de ambiente — nunca commitar `.env.server`
- `JWT_SECRET` deve ter pelo menos 32 caracteres aleatórios
- O ficheiro `infra/.env.server` está no `.gitignore`
