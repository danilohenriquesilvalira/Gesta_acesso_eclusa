# =============================================================================
#  disable_windows_update.ps1
#  Corre DENTRO do servidor Windows Server 2022 (via RDP ou PSExec)
#  Desativa Windows Update e servicos relacionados permanentemente
#  Servidores sem internet nao precisam de updates
# =============================================================================

Write-Host "A desativar Windows Update..." -ForegroundColor Cyan

$servicos = @(
    "wuauserv",    # Windows Update
    "WaaSMedicSvc", # Windows Update Medic (auto-reativa o update)
    "UsoSvc",      # Update Orchestrator
    "TrustedInstaller", # Windows Modules Installer (o que atrasa o shutdown)
    "BITS"         # Background Intelligent Transfer
)

foreach ($svc in $servicos) {
    try {
        Stop-Service -Name $svc -Force -ErrorAction SilentlyContinue
        Set-Service  -Name $svc -StartupType Disabled -ErrorAction SilentlyContinue
        Write-Host "  OK  $svc desativado" -ForegroundColor Green
    } catch {
        Write-Host "  --  $svc nao encontrado ou ja desativado" -ForegroundColor Gray
    }
}

# Desativar via Group Policy (mais robusto — sobrepoe-se ao servico)
$gpPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU"
New-Item -Path $gpPath -Force | Out-Null
Set-ItemProperty -Path $gpPath -Name "NoAutoUpdate"      -Value 1 -Type DWord
Set-ItemProperty -Path $gpPath -Name "AUOptions"         -Value 1 -Type DWord
Set-ItemProperty -Path $gpPath -Name "NoAutoRebootWithLoggedOnUsers" -Value 1 -Type DWord

Write-Host ""
Write-Host "  Windows Update desativado via GP registry" -ForegroundColor Green

# Bloquear WaaSMedicSvc via permissoes (este servico resiste ao Disabled)
$medicKey = "HKLM:\SYSTEM\CurrentControlSet\Services\WaaSMedicSvc"
if (Test-Path $medicKey) {
    try {
        $acl = Get-Acl $medicKey
        $acl.SetAccessRuleProtection($true, $false)
        Set-Acl -Path $medicKey -AclObject $acl -ErrorAction SilentlyContinue
        Write-Host "  OK  WaaSMedicSvc bloqueado via ACL" -ForegroundColor Green
    } catch {
        Write-Host "  --  WaaSMedicSvc ACL requer TrustedInstaller ownership" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "  Concluido. Reinicia o servidor para confirmar." -ForegroundColor Cyan
