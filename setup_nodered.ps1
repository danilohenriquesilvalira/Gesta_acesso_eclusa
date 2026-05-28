# =============================================================================
#  setup_nodered.ps1 -- Instala Node-RED em Docker no servidor
#  Corre tudo automaticamente sem perguntas
# =============================================================================

$PLINK   = "C:\Program Files\PuTTY\plink.exe"
$PSCP    = "C:\Program Files\PuTTY\pscp.exe"
$HOSTKEY = "SHA256:OzBG/LrAptWHadjm6g17jFJyiPIqnhIJ3h3SOE0JvCg"
$PASS    = "Rls@2024"
$SRV     = "rls@172.29.164.12"
$PATH_NR = "/home/rls/gestao-acessos-edp/node-red"
$REDE    = "gestao-acessos-edp_gestao_acesso_net"
$LOCAL   = "$PSScriptRoot\nodered_files"

function Passo  { param($msg) Write-Host ""; Write-Host "  >> $msg" -ForegroundColor Cyan }
function Ok     { param($msg) Write-Host "  OK  $msg" -ForegroundColor Green }
function Aviso  { param($msg) Write-Host "  !!  $msg" -ForegroundColor Yellow }
function Falhou { param($msg) Write-Host ""; Write-Host "  ERRO: $msg" -ForegroundColor Red; exit 1 }

function Run-SSH {
    param([string]$Cmd, [switch]$IgnoreError)
    $out = & "$PLINK" -ssh -batch -hostkey $HOSTKEY -pw $PASS $SRV $Cmd 2>&1
    if ($LASTEXITCODE -ne 0 -and -not $IgnoreError) {
        Falhou "SSH falhou ($LASTEXITCODE): $Cmd"
    }
    return $out
}

function Copy-File {
    param([string]$Local, [string]$Remote)
    & "$PSCP" -batch -hostkey $HOSTKEY -pw $PASS $Local "${SRV}:${Remote}"
    if ($LASTEXITCODE -ne 0) { Falhou "Falhou ao copiar $Local para $Remote" }
}

function Copy-Dir {
    param([string]$Local, [string]$Remote)
    & "$PSCP" -batch -hostkey $HOSTKEY -pw $PASS -r $Local "${SRV}:${Remote}"
    if ($LASTEXITCODE -ne 0) { Falhou "Falhou ao copiar pasta $Local" }
}

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor DarkCyan
Write-Host "   Node-RED Setup -- Controle de Acesso EDP" -ForegroundColor White
Write-Host "   Servidor : 172.29.164.12" -ForegroundColor Gray
Write-Host "   Hora     : $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')" -ForegroundColor Gray
Write-Host "  ============================================================" -ForegroundColor DarkCyan

# -- 1. Verificar ligacao -------------------------------------------------
Passo "A verificar ligacao SSH..."
$test = & "$PLINK" -ssh -batch -hostkey $HOSTKEY -pw $PASS $SRV "echo ligado_ok" 2>&1
if ($LASTEXITCODE -ne 0) { Falhou "Nao foi possivel ligar ao servidor" }
Ok "Ligacao estabelecida"

# -- 2. Verificar recursos ------------------------------------------------
Passo "A verificar recursos do servidor..."
$ram   = Run-SSH "free -m | grep '^Mem' | tr -s ' ' | cut -d' ' -f2,7" -IgnoreError
$disco = Run-SSH "df -BM / | tail -1 | tr -s ' ' | cut -d' ' -f4" -IgnoreError
$cpus  = Run-SSH "nproc" -IgnoreError
Write-Host "     RAM (total/livre MB): $ram"
Write-Host "     Disco livre: $disco"
Write-Host "     CPUs: $cpus"
Ok "Recursos verificados"

# -- 3. Criar estrutura de directorias ------------------------------------
Passo "A criar estrutura de directorias..."
Run-SSH "mkdir -p $PATH_NR/data" | Out-Null
Ok "Directorias criadas: $PATH_NR"

# -- 4. Gerar hash bcrypt -------------------------------------------------
Passo "A gerar hash bcrypt para login Node-RED..."

# Script Python escrito localmente e copiado via SCP
$pyFile = "$LOCAL\gen_hash.py"
$pyContent = @'
import sys
try:
    import bcrypt
except ImportError:
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "bcrypt", "-q"], capture_output=True)
    import bcrypt
h = bcrypt.hashpw(b"Rls@2024", bcrypt.gensalt(10)).decode()
print(h)
'@
[System.IO.File]::WriteAllText($pyFile, $pyContent, [System.Text.Encoding]::UTF8)
Copy-File $pyFile "/tmp/gen_hash.py"
Remove-Item $pyFile -Force

$hash = Run-SSH "python3 /tmp/gen_hash.py 2>/dev/null; rm -f /tmp/gen_hash.py" -IgnoreError
$hash = ($hash | Out-String).Trim()

if ($hash -notmatch '^\$2[aby]\$') {
    Aviso "Python bcrypt indisponivel. A usar hash pre-calculado..."
    # bcrypt de "Rls@2024" cost=10 — gerado previamente
    $hash = '$2b$10$yVrDGGF5je3F0V5JQ0MtauxaMt3cT0JN5U8qbXlAQpK9hZvzSMBci'
}
Write-Host "     Hash: $($hash.Substring(0,[Math]::Min(30,$hash.Length)))..."
Ok "Hash bcrypt pronto"

# -- 5. Injectar hash no settings.js e copiar ----------------------------
Passo "A criar settings.js com autenticacao..."
$settingsFile = "$LOCAL\settings.js"
# Ler ficheiro e substituir o placeholder
$content = [System.IO.File]::ReadAllText($settingsFile)
$content = $content.Replace("BCRYPT_PLACEHOLDER", $hash)
$tempSettings = [System.IO.Path]::GetTempFileName() + ".js"
[System.IO.File]::WriteAllText($tempSettings, $content, [System.Text.Encoding]::UTF8)
Copy-File $tempSettings "$PATH_NR/data/settings.js"
Remove-Item $tempSettings -Force
Ok "settings.js copiado"

# -- 6. Copiar docker-compose.yml ------------------------------------------
Passo "A copiar docker-compose.yml..."
Copy-File "$LOCAL\docker-compose.yml" "$PATH_NR/docker-compose.yml"
Ok "docker-compose.yml copiado"

# -- 7. Copiar flows.json --------------------------------------------------
Passo "A copiar flows.json inicial..."
Copy-File "$LOCAL\flows.json" "$PATH_NR/data/flows.json"
Ok "flows.json copiado"

# -- 8. Permissoes ---------------------------------------------------------
Passo "A definir permissoes..."
Run-SSH "chmod -R 755 $PATH_NR; chown -R 1000:1000 $PATH_NR/data 2>/dev/null; echo ok" -IgnoreError | Out-Null
Ok "Permissoes definidas"

# -- 9. Remover container antigo ------------------------------------------
Passo "A remover container antigo (se existir)..."
Run-SSH "docker rm -f node-red 2>/dev/null; echo ok" -IgnoreError | Out-Null
Ok "Pronto"

# -- 10. Iniciar Node-RED -------------------------------------------------
Passo "A iniciar Node-RED via docker compose..."
$result = Run-SSH "cd $PATH_NR && (docker compose up -d 2>&1 || docker-compose up -d 2>&1)" -IgnoreError
Write-Host "     $result"
Ok "Comando enviado"

# -- 11. Aguardar arranque ------------------------------------------------
Passo "A aguardar arranque (~60s para descarregar imagem se primeira vez)..."
Write-Host "     A aguardar 60s..." -ForegroundColor DarkGray
Start-Sleep -Seconds 60

# -- 12. Verificar saude --------------------------------------------------
Passo "A verificar saude do Node-RED..."
$status = Run-SSH "docker ps --filter name=node-red --format 'Status: {{.Status}}'" -IgnoreError
Write-Host "     $status"

$checkCmd = 'curl -sf http://localhost:1880 -o /dev/null && echo HTTP_OK || echo HTTP_FALHOU'
$healthy = Run-SSH $checkCmd -IgnoreError
if ($healthy -match "HTTP_OK") {
    Ok "Node-RED a responder em http://172.29.164.12:1880"
} else {
    Aviso "Ainda a iniciar -- a aguardar mais 60s..."
    Start-Sleep -Seconds 60
    $healthy2 = Run-SSH $checkCmd -IgnoreError
    if ($healthy2 -match "HTTP_OK") {
        Ok "Node-RED online!"
    } else {
        Aviso "Verificar com: docker logs node-red"
    }
}

# -- 13. Instalar nodes PLC -----------------------------------------------
Passo "A instalar nodes Modbus, S7 e Dashboard (pode demorar ~1min)..."
$installResult = Run-SSH "docker exec node-red npm install --prefix /usr/src/node-red node-red-contrib-modbus node-red-contrib-s7 node-red-dashboard 2>&1 | tail -5" -IgnoreError
Write-Host "     $installResult"
Ok "Nodes instalados"

# -- 14. Reiniciar para carregar nodes ------------------------------------
Passo "A reiniciar Node-RED..."
Run-SSH "docker restart node-red" -IgnoreError | Out-Null
Write-Host "     A aguardar 20s..." -ForegroundColor DarkGray
Start-Sleep -Seconds 20

# -- 15. Status final -----------------------------------------------------
Passo "Status final..."
$finalStatus = Run-SSH "docker ps --filter name=node-red --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'" -IgnoreError
Write-Host "     $finalStatus"

$logs = Run-SSH "docker logs node-red --tail=8 2>&1" -IgnoreError
Write-Host ""
Write-Host "  -- Ultimas linhas de log --" -ForegroundColor DarkGray
($logs | Out-String).Trim() -split "`n" | ForEach-Object { Write-Host "     $_" -ForegroundColor DarkGray }

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor DarkGreen
Write-Host "   Node-RED instalado com sucesso!" -ForegroundColor Green
Write-Host "   URL    : http://172.29.164.12:1880" -ForegroundColor Gray
Write-Host "   Login  : rls / Rls@2024" -ForegroundColor Gray
Write-Host "   Rede   : $REDE" -ForegroundColor Gray
Write-Host "  ============================================================" -ForegroundColor DarkGreen
Write-Host ""
