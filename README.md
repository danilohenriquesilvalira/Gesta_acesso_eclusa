# Sistema de Monitorização e Controlo de Acesso Remoto — WinCC Industrial

Stack: **Rust + Axum** (API) · **Tauri v2 + React + Tailwind** (app desktop) · **VBScript** (WinCC) · **RustDesk** (acesso remoto)

---

## Infraestrutura

| Máquina | Função | IP |
|---|---|---|
| Windows Server 2012 #1 | Servidor WinCC + API Rust | 172.29.164.10 |
| Windows Server 2012 #2 | Cliente WinCC 1 | 172.29.164.54 |
| Windows Server 2012 #3 | Cliente WinCC 2 | 172.29.164.58 |
| Mini PCs da régua | App Tauri (2× monitores 1080p) | 172.29.164.x |

Máscara: `255.255.255.192` · Gateway: `172.29.164.1`

---

## 1. Compilar wincc-api (Rust + Axum)

> Compilar numa máquina com internet e Rust instalado. Copiar o .exe resultante.

### Pré-requisitos (máquina de compilação)

```bash
# Instalar Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Adicionar target para cross-compile a partir de Linux/Mac
rustup target add x86_64-pc-windows-gnu

# Em Linux: instalar linker mingw
sudo apt install gcc-mingw-w64-x86-64   # Debian/Ubuntu
```

### Compilar

```bash
cd wincc-api

# Cross-compile a partir de Linux/Mac
cargo build --release --target x86_64-pc-windows-gnu

# OU compilar nativamente em Windows (requer Visual Studio Build Tools)
cargo build --release
```

Binário resultante: `target/x86_64-pc-windows-gnu/release/wincc-api.exe`  
(ou `target/release/wincc-api.exe` se compilado nativamente no Windows)

### Instalar no servidor (172.29.164.10)

1. Copiar `wincc-api.exe` para `C:\wincc-api\wincc-api.exe`
2. A API cria automaticamente `C:\wincc_state\estado.json` na primeira execução
3. Executar: `C:\wincc-api\wincc-api.exe`

### Instalar como serviço Windows (opcional)

```powershell
# Usando NSSM (Non-Sucking Service Manager)
nssm install WinCCAPI "C:\wincc-api\wincc-api.exe"
nssm set WinCCAPI Start SERVICE_AUTO_START
nssm start WinCCAPI
```

### Testar a API

```powershell
# Health check
Invoke-RestMethod http://172.29.164.10:8080/health

# Ver estado
Invoke-RestMethod http://172.29.164.10:8080/estado

# Marcar cliente1 em uso
Invoke-RestMethod -Method POST -Uri http://172.29.164.10:8080/estado/cliente1 `
  -ContentType "application/json" `
  -Body '{"eclusa":"Eclusa Norte","operador":"Teste","em_operacao":true}'

# Libertar
Invoke-RestMethod -Method POST -Uri http://172.29.164.10:8080/estado/liberar/cliente1
```

---

## 2. Compilar eclusa-monitor (Tauri v2 + React)

> Compilar numa máquina Windows com internet. Os binários .exe e instaladores resultantes são copiados para os mini PCs.

### Pré-requisitos (máquina de compilação Windows)

```powershell
# 1. Node.js 20+ — https://nodejs.org
# 2. Rust + Visual Studio Build Tools
winget install Rustlang.Rustup
rustup default stable
rustup target add x86_64-pc-windows-msvc

# 3. WebView2 Runtime (normalmente já presente no Windows 11/Server 2019+)
#    Se necessário: https://developer.microsoft.com/microsoft-edge/webview2/

# 4. Dependências Tauri no Windows
# Visual Studio Build Tools com "Desktop development with C++"
```

### Instalar dependências e compilar

```bash
cd eclusa-monitor

# Instalar dependências npm
npm install

# Compilar app Tauri para Windows
npm run tauri build
```

Instalador resultante: `src-tauri/target/release/bundle/msi/eclusa-monitor_0.1.0_x64_en-US.msi`  
Executável standalone: `src-tauri/target/release/eclusa-monitor.exe`

### Configuração da API URL

Por padrão a app aponta para `http://172.29.164.10:8080`.

Para sobrepor, criar um ficheiro `config.json` **na mesma pasta** do `eclusa-monitor.exe`:

```json
{
  "api_url": "http://172.29.164.10:8080"
}
```

### Instalar nos mini PCs

1. Copiar `eclusa-monitor.exe` (ou instalar o .msi) para cada mini PC
2. Criar `config.json` junto ao .exe se necessário
3. Configurar para arrancar no início de sessão (opcional):
   - `Win + R` → `shell:startup` → criar atalho para o .exe

### Múltiplos monitores

A app arranca em fullscreen no monitor primário. Para configurar qual monitor é o primário:  
`Definições do Windows > Sistema > Monitor > Definir como principal`

---

## 3. Instalar e configurar RustDesk self-hosted (offline)

> O RustDesk substitui o RDP padrão da Microsoft por oferecer 60fps+ e melhor qualidade para animações SVG do WinCC.

### Download (numa máquina com internet)

```bash
# Versão recomendada: RustDesk 1.2.x
# https://github.com/rustdesk/rustdesk/releases

# Para Windows: rustdesk-<versão>.exe (cliente + servidor incluídos no mesmo instalador)
# Para servidor relay (hbbr/hbbs): rustdesk-server-windows-x86_64.zip
```

### Instalar servidor relay no 172.29.164.10

O servidor relay permite ligações internas sem internet — tudo fica dentro da VLAN.

```powershell
# Extrair rustdesk-server-windows-x86_64.zip para C:\rustdesk-server\

# Iniciar servidor de IDs (hbbs) — porta 21115, 21116, 21118
C:\rustdesk-server\hbbs.exe

# Iniciar servidor relay (hbbr) — porta 21117
C:\rustdesk-server\hbbr.exe
```

Como serviço permanente com NSSM:

```powershell
nssm install RustDeskHBBS "C:\rustdesk-server\hbbs.exe"
nssm install RustDeskHBBR "C:\rustdesk-server\hbbr.exe"
nssm set RustDeskHBBS Start SERVICE_AUTO_START
nssm set RustDeskHBBR Start SERVICE_AUTO_START
nssm start RustDeskHBBS
nssm start RustDeskHBBR
```

### Configurar clientes WinCC (172.29.164.54 e 172.29.164.58)

1. Instalar `rustdesk.exe` em cada cliente
2. Abrir RustDesk > Configurações > Rede > Servidor ID/Relay:
   - ID Server: `172.29.164.10`
   - Relay Server: `172.29.164.10`
   - API Server: (deixar vazio)
3. Ativar acesso não supervisionado: definir password estática em Configurações > Segurança

### Configurar mini PCs da régua

1. Instalar `rustdesk.exe` em cada mini PC
2. Configurar servidor igual ao passo anterior
3. Testar ligação manual: RustDesk > inserir ID do cliente > Conectar

### Comando usado pela app Tauri

```bash
rustdesk --connect 172.29.164.54
rustdesk --connect 172.29.164.58
```

A app tenta automaticamente `rustdesk` no PATH e depois `C:\Program Files\RustDesk\rustdesk.exe`.

### Portas a abrir no firewall (interno)

```
TCP/UDP 21115  — hbbs (negociação NAT)
TCP/UDP 21116  — hbbs (registo IDs)
TCP     21117  — hbbr (relay de dados)
TCP     21118  — hbbs (WebSocket)
TCP     21119  — hbbr (WebSocket)
```

```powershell
# Abrir portas no Windows Firewall do servidor 172.29.164.10
New-NetFirewallRule -DisplayName "RustDesk" -Direction Inbound `
  -Protocol TCP -LocalPort 21115,21116,21117,21118,21119 -Action Allow
New-NetFirewallRule -DisplayName "RustDesk UDP" -Direction Inbound `
  -Protocol UDP -LocalPort 21115,21116 -Action Allow

# Abrir porta da API
New-NetFirewallRule -DisplayName "WinCC API" -Direction Inbound `
  -Protocol TCP -LocalPort 8080 -Action Allow
```

---

## 4. Configurar scripts no WinCC Explorer 7.5

### Passo 1 — Abrir Global Scripts

WinCC Explorer > duplo clique em **Global Scripts** > separador **VBS Actions**

### Passo 2 — Configurar atualizar_estado.vbs

1. Clicar com botão direito na área de scripts > **New**
2. Nome: `Atualizar_Estado_API`
3. Copiar conteúdo de `wincc-scripts/atualizar_estado.vbs`
4. **Adaptar as constantes no início do script:**
   - `CLIENTE_ID`: `"cliente1"` na máquina 172.29.164.54, `"cliente2"` na 172.29.164.58
   - `TAG_ECLUSA_NOME`: nome real da tag WinCC com o nome da eclusa activa
   - `TAG_EM_OPERACAO`: nome real da tag booleana de operação activa
5. **Definir trigger**: botão direito na action > Properties > Trigger > **Timer**
   - Intervalo: `5000 ms`

### Passo 3 — Configurar liberar_eclusa.vbs

1. Criar nova action: `Liberar_Eclusa_API`
2. Copiar conteúdo de `wincc-scripts/liberar_eclusa.vbs`
3. Adaptar `CLIENTE_ID` conforme a máquina
4. **Associar a um evento** (escolher uma opção):
   - **Botão no ecrã WinCC**: criar botão > evento "Mouse Click Up" > chamar esta action
   - **Runtime Stop**: Global Scripts > Events > Runtime Stop > chamar esta action
   - **Ambos** (recomendado): garante libertação mesmo em shutdown inesperado

### Passo 4 — Testar os scripts

1. Abrir WinCC Runtime
2. No Script Diagnostics (View > Script Diagnostics): verificar se aparecem erros
3. Verificar na API: `Invoke-RestMethod http://172.29.164.10:8080/estado`
4. O estado deve atualizar com o nome do operador e eclusa a cada 5 segundos

### Notas sobre USERNAME no WinCC

- `Environ("USERNAME")` retorna o utilizador Windows da sessão onde o WinCC Runtime corre
- Em sessão RDP: retorna o utilizador RDP autenticado — **este é o comportamento correto**
- Em sessão local: retorna o utilizador local
- Se o WinCC corre como serviço Windows: retorna o utilizador do serviço (SYSTEM ou configurado) — neste caso usar o **Método 2 (WMI)** ou o **Método 3 (tag WinCC)** descritos no script

---

## 5. Distribuição de ficheiros nas máquinas

### 172.29.164.10 — Servidor WinCC

```
C:\wincc-api\
    wincc-api.exe           ← API Rust (arrancar como serviço)

C:\rustdesk-server\
    hbbs.exe                ← Servidor de IDs RustDesk
    hbbr.exe                ← Servidor relay RustDesk

C:\wincc_state\
    estado.json             ← Criado automaticamente pela API
```

### 172.29.164.54 e 172.29.164.58 — Clientes WinCC

```
C:\Program Files\RustDesk\
    rustdesk.exe            ← Cliente RustDesk (acesso não supervisionado ativo)

WinCC Global Scripts:
    Atualizar_Estado_API    ← Timer 5s
    Liberar_Eclusa_API      ← Evento botão + Runtime Stop
```

### Mini PCs da régua

```
C:\eclusa-monitor\
    eclusa-monitor.exe      ← App Tauri (fullscreen)
    config.json             ← Opcional, se API URL diferente do padrão

C:\Program Files\RustDesk\
    rustdesk.exe            ← Para abrir sessões nos clientes
```

---

## 6. Testar o sistema completo

### Sequência de teste

1. **Verificar API**: `Invoke-RestMethod http://172.29.164.10:8080/health`
   - Resposta esperada: `{"status":"ok","timestamp":"..."}`

2. **Verificar estado inicial**: `Invoke-RestMethod http://172.29.164.10:8080/estado`
   - Ambos os clientes devem aparecer como `LIVRE`

3. **Testar app Tauri** (num mini PC):
   - Abrir `eclusa-monitor.exe`
   - Deve aparecer os dois painéis em verde "LIVRE"
   - Status bar em baixo deve mostrar "Ligado"

4. **Testar fluxo de conexão**:
   - Clicar "Conectar" no painel do Cliente WinCC 1
   - Inserir nome do operador → clicar "Conectar"
   - O painel deve ficar vermelho "EM USO" com o nome do operador
   - O RustDesk deve abrir automaticamente com sessão para 172.29.164.54
   - Verificar no outro mini PC: o painel 1 deve estar cinzento/desabilitado

5. **Testar scripts WinCC**:
   - Iniciar WinCC Runtime no cliente correspondente
   - Após 5 segundos, o campo "eclusa" deve atualizar com o valor da tag
   - O timer de sessão na app Tauri deve estar a contar

6. **Testar libertação**:
   - Clicar "Encerrar Sessão" na app Tauri
   - O painel deve voltar a verde "LIVRE"
   - Verificar via API: `eclusa` deve ser `"LIVRE"`, `operador` deve ser `""`

### Diagnóstico de problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| App Tauri mostra "Sem ligação" | API não está a correr | Iniciar `wincc-api.exe` no 172.29.164.10 |
| Botão "Conectar" não abre RustDesk | RustDesk não está no PATH | Instalar RustDesk ou verificar caminho em `lib.rs` |
| Estado não atualiza do WinCC | Script VBS com erro | Ver Script Diagnostics no WinCC; verificar nome das tags |
| Timeout na API do WinCC | Firewall bloqueando porta 8080 | Adicionar regra de firewall no 172.29.164.10 |
| RustDesk não conecta | hbbs/hbbr não estão a correr | Iniciar serviços no 172.29.164.10 |
| USERNAME retorna "SYSTEM" | WinCC corre como serviço | Usar Método 2 (WMI) no script VBS |

---

## Estrutura do repositório

```
Controle_Acesso/
├── wincc-api/              ← API Rust + Axum
│   ├── Cargo.toml
│   └── src/main.rs
│
├── eclusa-monitor/         ← App Tauri v2 + React
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── App.tsx
│   │   ├── index.css
│   │   ├── main.tsx
│   │   └── components/
│   │       ├── ClientePanel.tsx
│   │       ├── ConectarModal.tsx
│   │       └── StatusBar.tsx
│   └── src-tauri/
│       ├── Cargo.toml
│       ├── build.rs
│       ├── tauri.conf.json
│       ├── capabilities/default.json
│       └── src/
│           ├── main.rs
│           └── lib.rs
│
├── wincc-scripts/          ← VBScript para WinCC Explorer 7.5
│   ├── atualizar_estado.vbs
│   └── liberar_eclusa.vbs
│
└── README.md
```
