# =============================================================================
#  deploy.ps1 -- Deploy completo para o servidor de producao
#
#  Uso:  .\deploy.ps1              (git pull + rebuild + restart + limpeza)
#        .\deploy.ps1 -VerLogs     (mostra logs do container no final)
# =============================================================================

param(
    [switch]$VerLogs
)

$SERVIDOR_IP   = "172.29.164.12"
$SERVIDOR_USER = "rls"
$SERVIDOR_PASS = "Rls@2024"
$SERVIDOR_PATH = "/home/rls/gestao-acessos-edp"
$REDE_DOCKER   = "gestao-acessos-edp_gestao_acesso_net"
$IMAGEM        = "gestao-acessos-edp-wincc-api"
$DB_URL        = "postgres://eclusa_admin:Rls@2024@gestao-acesso-db:5432/gestao_acesso_eclusa"
$HOSTKEY       = "SHA256:OzBG/LrAptWHadjm6g17jFJyiPIqnhIJ3h3SOE0JvCg"
$PLINK         = "C:\Program Files\PuTTY\plink.exe"

function Passo  { param($msg) Write-Host ""; Write-Host "  >> $msg" -ForegroundColor Cyan }
function Ok     { param($msg) Write-Host "  OK  $msg" -ForegroundColor Green }
function Aviso  { param($msg) Write-Host "  !!  $msg" -ForegroundColor Yellow }
function Falhou { param($msg) Write-Host ""; Write-Host "  ERRO: $msg" -ForegroundColor Red; exit 1 }

function Invoke-SSH {
    param([string]$Cmd)
    & "$PLINK" -ssh -batch -hostkey $HOSTKEY -pw $SERVIDOR_PASS "${SERVIDOR_USER}@${SERVIDOR_IP}" $Cmd
    if ($LASTEXITCODE -ne 0) { Falhou "Comando SSH falhou: $Cmd" }
}

if (-not (Test-Path $PLINK)) { Falhou "plink.exe nao encontrado em $PLINK" }

$inicio = Get-Date
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor DarkCyan
Write-Host "   Deploy -- Controle de Acesso EDP" -ForegroundColor White
Write-Host "   Servidor : $SERVIDOR_IP" -ForegroundColor Gray
Write-Host "   Hora     : $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')" -ForegroundColor Gray
Write-Host "  ============================================================" -ForegroundColor DarkCyan

# -- 1. Verificar ligacao SSH --------------------------------------------------
Passo "A verificar ligacao SSH..."
& "$PLINK" -ssh -batch -hostkey $HOSTKEY -pw $SERVIDOR_PASS "${SERVIDOR_USER}@${SERVIDOR_IP}" "echo ok" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Falhou "Nao foi possivel ligar a ${SERVIDOR_USER}@${SERVIDOR_IP}" }
Ok "Ligacao SSH estabelecida"

# -- 2. Git pull no servidor ---------------------------------------------------
Passo "A actualizar codigo no servidor (git pull)..."
Invoke-SSH "cd $SERVIDOR_PATH && git fetch origin && git reset --hard origin/main"
Ok "Codigo actualizado"

# -- 3. Build da imagem Docker -------------------------------------------------
Passo "A compilar wincc-api (~40s com cache, ~5min primeira vez)..."
Invoke-SSH "cd $SERVIDOR_PATH && docker build -t $IMAGEM ./wincc-api"
Ok "Imagem compilada"

# -- 4. Parar e remover container antigo --------------------------------------
Passo "A parar container antigo..."
& "$PLINK" -ssh -batch -hostkey $HOSTKEY -pw $SERVIDOR_PASS "${SERVIDOR_USER}@${SERVIDOR_IP}" "docker rm -f wincc-api 2>/dev/null || true" | Out-Null
Ok "Container antigo removido"

# -- 5. Iniciar novo container -------------------------------------------------
Passo "A iniciar novo container..."
Invoke-SSH "docker run -d --name wincc-api --restart unless-stopped --network $REDE_DOCKER -p 8080:8080 --env-file $SERVIDOR_PATH/.env -e DATABASE_URL=$DB_URL $IMAGEM"
Ok "Container iniciado"

# -- 6. Health check -----------------------------------------------------------
Passo "A aguardar arranque (3s)..."
Start-Sleep -Seconds 3
$health = & "$PLINK" -ssh -batch -hostkey $HOSTKEY -pw $SERVIDOR_PASS "${SERVIDOR_USER}@${SERVIDOR_IP}" "curl -sf http://localhost:8080/health || echo FALHOU" 2>&1
if ($health -match "FALHOU") {
    Aviso "Health check falhou -- corre: .\deploy.ps1 -VerLogs"
} else {
    Ok "API online: $health"
}

# -- 7. Limpeza de imagens Docker antigas -------------------------------------
Passo "A limpar imagens antigas..."
& "$PLINK" -ssh -batch -hostkey $HOSTKEY -pw $SERVIDOR_PASS "${SERVIDOR_USER}@${SERVIDOR_IP}" "docker image prune -f" | Out-Null
Ok "Servidor limpo"

# -- 8. Logs (opcional) --------------------------------------------------------
if ($VerLogs) {
    Write-Host ""
    Write-Host "  -- Ultimas 50 linhas de log --" -ForegroundColor DarkCyan
    Invoke-SSH "docker logs --tail=50 wincc-api"
}

$segundos = [math]::Round(((Get-Date) - $inicio).TotalSeconds)
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor DarkGreen
Write-Host "   Deploy concluido em ${segundos}s" -ForegroundColor Green
Write-Host "   API  : http://${SERVIDOR_IP}:8080/health" -ForegroundColor Gray
Write-Host "   Logs : .\deploy.ps1 -VerLogs" -ForegroundColor Gray
Write-Host "  ============================================================" -ForegroundColor DarkGreen
Write-Host ""
