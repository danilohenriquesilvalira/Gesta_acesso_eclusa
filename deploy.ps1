# =============================================================================
#  deploy.ps1 -- Actualiza o servidor de producao com o codigo local
#
#  Uso:  .\deploy.ps1
#        .\deploy.ps1 -SoBackend    (reconstroi sem copiar ficheiros)
#        .\deploy.ps1 -VerLogs      (mostra logs do container no final)
# =============================================================================

param(
    [switch]$SoBackend,
    [switch]$VerLogs
)

# -- Configuracao --------------------------------------------------------------
$SERVIDOR_IP   = "172.29.164.12"
$SERVIDOR_USER = "rls"
$SERVIDOR_PASS = "Rls@2024"
$SERVIDOR_PATH = "/home/rls/gestao-acessos-edp"
$LOCAL_ROOT    = $PSScriptRoot

$PLINK = "C:\Program Files\PuTTY\plink.exe"
$PSCP  = "C:\Program Files\PuTTY\pscp.exe"

# =============================================================================

function Passo  { param($msg) Write-Host "" ; Write-Host "  >> $msg" -ForegroundColor Cyan }
function Ok     { param($msg) Write-Host "  OK  $msg" -ForegroundColor Green }
function Aviso  { param($msg) Write-Host "  !!  $msg" -ForegroundColor Yellow }
function Falhou { param($msg) Write-Host "" ; Write-Host "  ERRO: $msg" -ForegroundColor Red ; exit 1 }

$HOSTKEY = "SHA256:OzBG/LrAptWHadjm6g17jFJyiPIqnhIJ3h3SOE0JvCg"

function Invoke-SSH {
    param([string]$Cmd)
    & "$PLINK" -ssh -batch -hostkey $HOSTKEY -pw $SERVIDOR_PASS "${SERVIDOR_USER}@${SERVIDOR_IP}" $Cmd
    if ($LASTEXITCODE -ne 0) { Falhou "Comando SSH falhou: $Cmd" }
}

function Send-SCP {
    param([string]$Origem, [string]$Destino)
    & "$PSCP" -hostkey $HOSTKEY -pw $SERVIDOR_PASS -r -batch $Origem "${SERVIDOR_USER}@${SERVIDOR_IP}:${Destino}"
    if ($LASTEXITCODE -ne 0) { Falhou "Falha ao copiar: $Origem" }
}

# -- Verificar ferramentas ----------------------------------------------------
if (-not (Test-Path $PLINK)) { Falhou "plink.exe nao encontrado em $PLINK" }
if (-not (Test-Path $PSCP))  { Falhou "pscp.exe nao encontrado em $PSCP" }

# -- Cabecalho ----------------------------------------------------------------
$inicio = Get-Date
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor DarkCyan
Write-Host "   Deploy -- Controle de Acesso EDP" -ForegroundColor White
Write-Host "   Servidor : $SERVIDOR_IP" -ForegroundColor Gray
Write-Host "   Hora     : $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')" -ForegroundColor Gray
Write-Host "  ============================================================" -ForegroundColor DarkCyan

# -- 1. Verificar ligacao SSH --------------------------------------------------
Passo "A verificar ligacao SSH ao servidor..."
& "$PLINK" -ssh -batch -hostkey $HOSTKEY -pw $SERVIDOR_PASS "${SERVIDOR_USER}@${SERVIDOR_IP}" "echo conectado" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Falhou "Nao foi possivel ligar a ${SERVIDOR_USER}@${SERVIDOR_IP}. Verifica IP e credenciais."
}
Ok "Ligacao SSH estabelecida"

# -- 2. Copiar ficheiros -------------------------------------------------------
if (-not $SoBackend) {

    Passo "A criar estrutura de pastas no servidor..."
    Invoke-SSH "mkdir -p $SERVIDOR_PATH/wincc-api/src $SERVIDOR_PATH/infra"
    Ok "Estrutura verificada"

    Passo "A copiar codigo fonte Rust (src/)..."
    Send-SCP "$LOCAL_ROOT\wincc-api\src" "$SERVIDOR_PATH/wincc-api/"
    Ok "src/ copiado"

    Passo "A copiar Cargo.toml, Cargo.lock, Dockerfile..."
    Send-SCP "$LOCAL_ROOT\wincc-api\Cargo.toml"  "$SERVIDOR_PATH/wincc-api/Cargo.toml"
    Send-SCP "$LOCAL_ROOT\wincc-api\Cargo.lock"  "$SERVIDOR_PATH/wincc-api/Cargo.lock"
    Send-SCP "$LOCAL_ROOT\wincc-api\Dockerfile"  "$SERVIDOR_PATH/wincc-api/Dockerfile"
    Ok "Ficheiros de compilacao copiados"

    Passo "A copiar docker-compose.yml..."
    Send-SCP "$LOCAL_ROOT\infra\docker-compose.yml" "$SERVIDOR_PATH/infra/docker-compose.yml"
    Ok "docker-compose.yml copiado"

} else {
    Aviso "Modo -SoBackend activo -- copia de ficheiros ignorada"
}

# -- 3. Gerar chave SSH para VMs Windows (só se ainda não existir) -------------
Passo "A verificar chave SSH para as VMs Windows..."
Invoke-SSH "test -f $SERVIDOR_PATH/infra/ssh_key && echo 'chave ja existe' || (ssh-keygen -t ed25519 -f $SERVIDOR_PATH/infra/ssh_key -N '' && chmod 600 $SERVIDOR_PATH/infra/ssh_key && echo 'chave gerada')"
Write-Host ""
$pubkey = & "$PLINK" -ssh -batch -hostkey $HOSTKEY -pw $SERVIDOR_PASS "${SERVIDOR_USER}@${SERVIDOR_IP}" "cat $SERVIDOR_PATH/infra/ssh_key.pub" 2>&1
Write-Host "  CHAVE PUBLICA SSH (adicionar nas VMs Windows):" -ForegroundColor Yellow
Write-Host "  $pubkey" -ForegroundColor White
Write-Host ""
Ok "Chave SSH verificada"

# -- 4. Rebuild Docker ---------------------------------------------------------
Passo "A reconstruir o backend no servidor (2-4 min)..."
Invoke-SSH "cd $SERVIDOR_PATH/infra && docker compose up -d --build api"
Ok "Container reconstruido e em execucao"

# -- 5. Limpar imagens antigas -------------------------------------------------
Passo "A limpar imagens Docker obsoletas..."
& "$PLINK" -ssh -batch -hostkey $HOSTKEY -pw $SERVIDOR_PASS "${SERVIDOR_USER}@${SERVIDOR_IP}" "docker image prune -f" | Out-Null
Ok "Limpeza concluida"

# -- 6. Health check -----------------------------------------------------------
Passo "A aguardar arranque do backend (5s)..."
Start-Sleep -Seconds 5
$health = & "$PLINK" -ssh -batch -hostkey $HOSTKEY -pw $SERVIDOR_PASS "${SERVIDOR_USER}@${SERVIDOR_IP}" "curl -sf http://localhost:8080/health && echo ONLINE || echo FALHOU" 2>&1
if ($health -match "FALHOU" -or $LASTEXITCODE -ne 0) {
    Aviso "Health check nao respondeu -- pode ainda estar a compilar"
    Aviso "Verifica com: .\deploy.ps1 -VerLogs"
} else {
    Ok "Backend online: http://${SERVIDOR_IP}:8080/health"
}

# -- 7. Logs (opcional) --------------------------------------------------------
if ($VerLogs) {
    Write-Host ""
    Write-Host "  -- Ultimas 50 linhas de log --" -ForegroundColor DarkCyan
    Invoke-SSH "docker compose -f $SERVIDOR_PATH/infra/docker-compose.yml logs --tail=50 api"
}

# -- Resumo -------------------------------------------------------------------
$segundos = [math]::Round(((Get-Date) - $inicio).TotalSeconds)
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor DarkGreen
Write-Host "   Deploy concluido em ${segundos}s" -ForegroundColor Green
Write-Host "   API  : http://${SERVIDOR_IP}:8080/health" -ForegroundColor Gray
Write-Host "   Logs : .\deploy.ps1 -VerLogs" -ForegroundColor Gray
Write-Host "  ============================================================" -ForegroundColor DarkGreen
Write-Host ""
