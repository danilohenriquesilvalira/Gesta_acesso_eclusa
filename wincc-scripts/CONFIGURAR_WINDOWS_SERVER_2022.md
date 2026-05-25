# Configuração Windows Server 2022 — VM WinCC EDP

Guia para configurar cada nova VM Windows Server 2022 no Proxmox.
Executar estes passos em cada VM antes de ligar ao sistema.

---

## Topologia actual

| VM    | IP              | Função                  |
|-------|-----------------|-------------------------|
| VM 101 | 172.29.164.13  | WinCC Eclusa Régua (RG) |
| VM 102 | 172.29.164.14  | WinCC Eclusa Pocinho (PN) |
| VM 103 | 172.29.164.15  | Reserva / Failover      |
| VM 100 | 172.29.164.12  | Ubuntu Server (backend) |

**Credenciais padrão:** `Administrator` / `Rls@2024`

---

## PASSO 1 — Activar RDP

No PowerShell como Administrator:

```powershell
# Activar RDP
Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name "fDenyTSConnections" -Value 0

# Activar NLA (Network Level Authentication)
Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' -Name "UserAuthentication" -Value 1

# Abrir porta 3389 no firewall
Enable-NetFirewallRule -DisplayGroup "Remote Desktop"

# Confirmar que o serviço está a correr
Set-Service -Name TermService -StartupType Automatic
Start-Service TermService

Write-Host "RDP activado com sucesso"
```

---

## PASSO 2 — Instalar OpenSSH Server

O backend Ubuntu faz SSH para esta VM para executar `qwinsta`.

```powershell
# Instalar OpenSSH Server
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0

# Configurar arranque automático e iniciar
Set-Service -Name sshd -StartupType Automatic
Start-Service sshd

# Abrir porta 22 no firewall
New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server (sshd)' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22

Write-Host "OpenSSH instalado e a correr"
```

---

## PASSO 3 — Configurar PowerShell como shell SSH

```powershell
# Definir PowerShell como shell padrão do SSH
New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell -Value "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force

Write-Host "PowerShell definido como shell SSH"
```

**ATENÇÃO:** O caminho tem de ser exactamente este — com `\v1.0\` incluído.

---

## PASSO 4 — Autorizar a chave SSH do servidor backend

A chave pública do servidor Ubuntu (backend) tem de estar neste ficheiro:
`C:\ProgramData\ssh\administrators_authorized_keys`

```powershell
# Criar pasta se não existir
New-Item -ItemType Directory -Force -Path "C:\ProgramData\ssh"

# Escrever a chave pública (UTF-8 sem BOM — OBRIGATÓRIO)
$chave = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDz96FjJubzT1L7bb1PHgsHXDYLh1jftV3jNblkcUE3O wincc-api@linux-server"
[System.IO.File]::WriteAllText("C:\ProgramData\ssh\administrators_authorized_keys", $chave + "`n", [System.Text.Encoding]::UTF8)

# Permissões correctas (obrigatório para o OpenSSH aceitar)
icacls "C:\ProgramData\ssh\administrators_authorized_keys" /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"

Write-Host "Chave SSH autorizada"
```

---

## PASSO 5 — Configurar shadow RDP (supervisão)

Permite que supervisores vejam a sessão em modo view-only.

```powershell
# Permitir shadow sem consentimento do utilizador (modo supervisão)
Set-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services' -Name "Shadow" -Value 2 -Type DWord -Force

# Criar política se a chave não existir
$path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services'
if (-not (Test-Path $path)) { New-Item -Path $path -Force }
Set-ItemProperty -Path $path -Name "Shadow" -Value 2 -Type DWord -Force

Write-Host "Shadow RDP configurado"
```

---

## PASSO 6 — Verificar tudo

```powershell
Write-Host "=== VERIFICACAO ===" -ForegroundColor Cyan

# RDP
$rdp = Get-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name fDenyTSConnections
if ($rdp.fDenyTSConnections -eq 0) { Write-Host "RDP: OK" -ForegroundColor Green } else { Write-Host "RDP: FALHOU" -ForegroundColor Red }

# SSH
$sshd = Get-Service sshd -ErrorAction SilentlyContinue
if ($sshd.Status -eq 'Running') { Write-Host "SSH: OK" -ForegroundColor Green } else { Write-Host "SSH: FALHOU" -ForegroundColor Red }

# Chave autorizada
if (Test-Path "C:\ProgramData\ssh\administrators_authorized_keys") { Write-Host "Chave SSH: OK" -ForegroundColor Green } else { Write-Host "Chave SSH: NAO ENCONTRADA" -ForegroundColor Red }

# IP da máquina
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "172.29.*" }).IPAddress
Write-Host "IP: $ip" -ForegroundColor Cyan
```

---

## PASSO 7 — Teste do servidor backend

Depois de configurada a VM, confirmar do servidor Ubuntu que o SSH funciona:

```bash
# No servidor Ubuntu (172.29.164.12)
ssh -i /etc/wincc-api/ssh_key -o StrictHostKeyChecking=no Administrator@172.29.164.13 'qwinsta'
```

Output esperado:
```
 SESSIONNAME       USERNAME    ID  STATE   TYPE    DEVICE
>services                       0  Disc
 console                        1  Conn
 rdp-tcp                    65537  Listen
```

Se aparecer output do `qwinsta`, a VM está correctamente configurada.

---

## Script completo (executar tudo de uma vez)

Copiar e executar no PowerShell como Administrator na nova VM:

```powershell
# ============================================================
# Configuracao completa VM WinCC EDP — executar como Administrator
# ============================================================

Write-Host "A configurar VM..." -ForegroundColor Cyan

# RDP
Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name "fDenyTSConnections" -Value 0
Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' -Name "UserAuthentication" -Value 1
Enable-NetFirewallRule -DisplayGroup "Remote Desktop"
Set-Service -Name TermService -StartupType Automatic
Start-Service TermService

# OpenSSH
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Set-Service -Name sshd -StartupType Automatic
Start-Service sshd
New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server (sshd)' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 -ErrorAction SilentlyContinue

# PowerShell como shell SSH
New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell -Value "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force

# Chave SSH do backend
New-Item -ItemType Directory -Force -Path "C:\ProgramData\ssh" | Out-Null
$chave = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDz96FjJubzT1L7bb1PHgsHXDYLh1jftV3jNblkcUE3O wincc-api@linux-server"
[System.IO.File]::WriteAllText("C:\ProgramData\ssh\administrators_authorized_keys", $chave + "`n", [System.Text.Encoding]::UTF8)
icacls "C:\ProgramData\ssh\administrators_authorized_keys" /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"

# Shadow RDP
$path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services'
if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
Set-ItemProperty -Path $path -Name "Shadow" -Value 2 -Type DWord -Force

Write-Host "Configuracao concluida!" -ForegroundColor Green
Write-Host "Testa no servidor Ubuntu: ssh -i /etc/wincc-api/ssh_key -o StrictHostKeyChecking=no Administrator@<IP_DESTA_VM> 'qwinsta'" -ForegroundColor Yellow
```
