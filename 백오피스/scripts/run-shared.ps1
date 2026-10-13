# 같은 네트워크(사내 Wi-Fi/LAN)의 다른 PC에서 접속할 수 있게 백오피스를 띄웁니다.
# 사용: 프로젝트 루트에서  powershell -ExecutionPolicy Bypass -File .\scripts\run-shared.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# 1) 방화벽에서 8080 포트 허용 (관리자 권한 PowerShell 에서 한 번만 필요. 이미 있으면 건너뜀)
$rule = Get-NetFirewallRule -DisplayName 'AICA Backoffice 8080' -ErrorAction SilentlyContinue
if (-not $rule) {
  try { New-NetFirewallRule -DisplayName 'AICA Backoffice 8080' -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Private,Domain | Out-Null
        Write-Host '방화벽 규칙 추가: TCP 8080 허용' }
  catch { Write-Warning '방화벽 규칙을 추가하지 못했습니다(관리자 권한 필요). 다른 PC에서 접속이 안 되면 관리자 PowerShell 에서 이 스크립트를 다시 실행하세요.' }
}

# 2) 접속 주소 안내
$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -ExpandProperty IPAddress
Write-Host ''
Write-Host '다른 PC에서 접속할 주소 (같은 네트워크여야 합니다):' -ForegroundColor Cyan
foreach ($ip in $ips) { Write-Host "  http://$ip:8080/" -ForegroundColor Green }
Write-Host '종료: 이 창에서 Ctrl+C'
Write-Host ''

# 3) 모든 네트워크 인터페이스에서 수신하도록 실행
$env:BACKOFFICE_BIND = '0.0.0.0'
& .\mvnw.cmd -B -ntp spring-boot:run
