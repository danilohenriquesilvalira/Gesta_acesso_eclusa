# Correr este script em cada servidor WinCC como Administrador.
# NAO reinicia servicos — aplica imediatamente para novas ligacoes.
#
# Shadow=2 : Full control WITHOUT user's permission (necessario para mstsc /shadow funcionar)

$path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services'

if (-not (Test-Path $path)) {
    New-Item -Path $path -Force | Out-Null
}

Set-ItemProperty -Path $path -Name 'Shadow' -Value 2 -Type DWord -Force

$val = (Get-ItemProperty -Path $path -Name Shadow -ErrorAction SilentlyContinue).Shadow
Write-Host "Shadow configurado: $val (2 = full control sem consentimento)" -ForegroundColor Green
