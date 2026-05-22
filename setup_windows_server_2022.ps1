# =============================================================================
# setup_windows_server_2022.ps1
# Configuração do OpenSSH Server nas VMs Windows Server 2022 (WinCC)
#
# Executar em cada VM como Administrador:
#   powershell.exe -ExecutionPolicy Bypass -File setup_windows_server_2022.ps1
#
# Executar em TODAS as VMs WinCC (cliente1, cliente2, etc.)
# =============================================================================

#Requires -RunAsAdministrator
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Setup OpenSSH + WinCC-API helpers — Windows Server 2022"  -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Instalar OpenSSH Server ────────────────────────────────────────────────

Write-Host "[1/5] A instalar OpenSSH Server..." -ForegroundColor Yellow

$sshFeature = Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*'
if ($sshFeature.State -eq 'Installed') {
    Write-Host "      OpenSSH Server ja esta instalado." -ForegroundColor Green
} else {
    Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
    Write-Host "      OpenSSH Server instalado com sucesso." -ForegroundColor Green
}

# ── 2. Configurar e arrancar o serviço sshd ───────────────────────────────────

Write-Host "[2/5] A configurar servico sshd (auto-start)..." -ForegroundColor Yellow

Set-Service -Name sshd -StartupType Automatic
Start-Service -Name sshd

$sshdStatus = (Get-Service -Name sshd).Status
Write-Host "      sshd status: $sshdStatus" -ForegroundColor Green

# ── 3. Abrir porta 22 no Windows Firewall ────────────────────────────────────

Write-Host "[3/5] A configurar firewall (porta 22)..." -ForegroundColor Yellow

$ruleName = "WinCC-SSH-Inbound"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "      Regra de firewall ja existe." -ForegroundColor Green
} else {
    New-NetFirewallRule `
        -DisplayName $ruleName `
        -Direction   Inbound `
        -Protocol    TCP `
        -LocalPort   22 `
        -Action      Allow `
        -Profile     Any `
        -Enabled     True | Out-Null
    Write-Host "      Regra de firewall criada." -ForegroundColor Green
}

# ── 4. Configurar shell padrão SSH para PowerShell ───────────────────────────

Write-Host "[4/5] A definir PowerShell como shell padrao SSH..." -ForegroundColor Yellow

$psPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$regPath = "HKLM:\SOFTWARE\OpenSSH"
if (-not (Test-Path $regPath)) {
    New-Item -Path $regPath -Force | Out-Null
}
Set-ItemProperty -Path $regPath -Name DefaultShell -Value $psPath -Force
Write-Host "      Shell padrao: $psPath" -ForegroundColor Green

# ── 5. Criar directório e helper script ──────────────────────────────────────

Write-Host "[5/5] A criar directorio e helper script C:\wincc-api\..." -ForegroundColor Yellow

$dir = "C:\wincc-api"
if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

# get_client_ip.ps1 — obtém IP do cliente RDP por session_id via WTS API (P/Invoke)
# Chamado pela API Rust via SSH quando corre em Linux
$helperScript = @'
param([int]$SessionId)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class WTS {
    [DllImport("wtsapi32.dll", SetLastError=true)]
    public static extern IntPtr WTSOpenServer(string pServerName);

    [DllImport("wtsapi32.dll")]
    public static extern void WTSCloseServer(IntPtr hServer);

    [DllImport("wtsapi32.dll", SetLastError=true)]
    public static extern bool WTSQuerySessionInformation(
        IntPtr hServer, int SessionId, int WTSInfoClass,
        out IntPtr ppBuffer, out int pBytesReturned);

    [DllImport("wtsapi32.dll")]
    public static extern void WTSFreeMemory(IntPtr pMemory);

    [StructLayout(LayoutKind.Sequential)]
    public struct WTS_CLIENT_ADDRESS {
        public uint AddressFamily;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst=20)]
        public byte[] Address;
    }
}
"@ -ErrorAction SilentlyContinue

$WTSClientAddress = 14
$server = [WTS]::WTSOpenServer($env:COMPUTERNAME)
try {
    $buf   = [IntPtr]::Zero
    $bytes = 0
    $ok = [WTS]::WTSQuerySessionInformation($server, $SessionId, $WTSClientAddress, [ref]$buf, [ref]$bytes)
    if ($ok -and $buf -ne [IntPtr]::Zero) {
        $addr = [System.Runtime.InteropServices.Marshal]::PtrToStructure($buf, [WTS+WTS_CLIENT_ADDRESS])
        [WTS]::WTSFreeMemory($buf)
        if ($addr.AddressFamily -eq 2) {
            $ip = "{0}.{1}.{2}.{3}" -f $addr.Address[2], $addr.Address[3], $addr.Address[4], $addr.Address[5]
            if ($ip -ne "0.0.0.0") { Write-Output $ip }
        }
    }
} finally {
    [WTS]::WTSCloseServer($server)
}
'@

$helperPath = "$dir\get_client_ip.ps1"
Set-Content -Path $helperPath -Value $helperScript -Encoding UTF8
Write-Host "      Script criado: $helperPath" -ForegroundColor Green

# ── Autorizar chave SSH pública ───────────────────────────────────────────────

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  PASSO MANUAL NECESSARIO" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Adicionar a chave publica SSH do servidor Linux ao ficheiro:" -ForegroundColor White
Write-Host "  C:\ProgramData\ssh\administrators_authorized_keys" -ForegroundColor White
Write-Host ""
Write-Host "Exemplo (substituir pela chave real gerada no servidor Linux):" -ForegroundColor Gray
Write-Host "  ssh-ed25519 AAAA...chave_publica... wincc-api@linux-server" -ForegroundColor Gray
Write-Host ""
Write-Host "Comandos para configurar as permissoes correctas do ficheiro:" -ForegroundColor White
Write-Host '  icacls "C:\ProgramData\ssh\administrators_authorized_keys" /inheritance:r' -ForegroundColor Gray
Write-Host '  icacls "C:\ProgramData\ssh\administrators_authorized_keys" /grant SYSTEM:F' -ForegroundColor Gray
Write-Host '  icacls "C:\ProgramData\ssh\administrators_authorized_keys" /grant BUILTIN\Administrators:F' -ForegroundColor Gray
Write-Host ""
Write-Host "Gerar chave no servidor Linux (se ainda nao existir):" -ForegroundColor White
Write-Host "  ssh-keygen -t ed25519 -f /etc/wincc-api/ssh_key -N ''" -ForegroundColor Gray
Write-Host "  cat /etc/wincc-api/ssh_key.pub" -ForegroundColor Gray
Write-Host ""
Write-Host "Testar ligacao do Linux para esta VM:" -ForegroundColor White

$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.InterfaceAlias -notlike '*Loopback*' -and $_.IPAddress -notlike '169.*'
} | Select-Object -First 1).IPAddress

Write-Host "  ssh -i /etc/wincc-api/ssh_key Administrator@$localIP qwinsta" -ForegroundColor Gray
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Setup concluido nesta VM ($localIP)" -ForegroundColor Green
Write-Host "  Repetir em TODAS as VMs WinCC (cliente1, cliente2, ...)" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
