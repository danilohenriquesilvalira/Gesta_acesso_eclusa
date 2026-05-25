# =============================================================================
#  install_agent.ps1 — Instala wincc-agent como servico Windows
#  Corre DENTRO do servidor Windows como Administrador
#
#  Uso: .\install_agent.ps1 -Servidor "RG"
#       .\install_agent.ps1 -Servidor "PN"
#       .\install_agent.ps1 -Servidor "Reserva01"
# =============================================================================
param(
    [Parameter(Mandatory)]
    [ValidateSet("RG","PN","CL","CM","VR","Reserva01","Reserva02","Reserva03")]
    [string]$Servidor
)

$API_URL   = "http://172.29.164.12:8080"
$AGENT_DIR = "C:\wincc-agent"
$EXE       = "$AGENT_DIR\wincc-agent.exe"

# 1. Criar pasta
New-Item -ItemType Directory -Force -Path $AGENT_DIR | Out-Null

# 2. Escrever config
@"
{
  "api_url": "$API_URL",
  "servidor": "$Servidor"
}
"@ | Set-Content -Path "$AGENT_DIR\config.json" -Encoding UTF8

Write-Host "Config escrita: $AGENT_DIR\config.json" -ForegroundColor Cyan
Write-Host "  api_url  : $API_URL"  -ForegroundColor Gray
Write-Host "  servidor : $Servidor" -ForegroundColor Gray

# 3. Verificar exe
if (-not (Test-Path $EXE)) {
    Write-Host "ERRO: $EXE nao encontrado. Copia o wincc-agent.exe para $AGENT_DIR primeiro." -ForegroundColor Red
    exit 1
}

# 4. Remover servico antigo se existir
$svc = Get-Service -Name "WinCCAgent" -ErrorAction SilentlyContinue
if ($svc) {
    Write-Host "A remover servico antigo..." -ForegroundColor Yellow
    Stop-Service -Name "WinCCAgent" -Force -ErrorAction SilentlyContinue
    & "$EXE" --remove 2>$null
    Start-Sleep -Seconds 2
}

# 5. Instalar e iniciar
Write-Host "A instalar servico WinCCAgent ($Servidor)..." -ForegroundColor Cyan
& "$EXE" --install
if ($LASTEXITCODE -eq 0) {
    Write-Host "Servico WinCCAgent instalado com sucesso!" -ForegroundColor Green
    Get-Service -Name "WinCCAgent" | Select-Object Name, Status, StartType
} else {
    Write-Host "ERRO ao instalar servico." -ForegroundColor Red
}
