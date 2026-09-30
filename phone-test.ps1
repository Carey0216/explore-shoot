param([string]$Address)
$ErrorActionPreference = 'Stop'
$nodePath = (Get-Command node -ErrorAction Stop).Source
$projectDirectory = $PSScriptRoot
$addresses = & $nodePath (Join-Path $projectDirectory 'tools/phone-bridge.cjs') --list-addresses | ConvertFrom-Json
if (-not $Address) {
    $selected = $addresses | Where-Object { $_.name -match 'WLAN|Wi-Fi|Wireless|无线' } | Select-Object -First 1
    if (-not $selected) { $selected = $addresses | Select-Object -First 1 }
    if (-not $selected) { throw 'No LAN IPv4 address was found. Connect the computer to Wi-Fi first.' }
    $Address = $selected.address
}
if (-not ($addresses | Where-Object { $_.address -eq $Address })) { throw 'The selected address does not belong to this computer.' }
$origin = "http://${Address}:4178"
Start-Process powershell.exe -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + (Join-Path $projectDirectory 'start.ps1') + '"'), '-NoBrowser' -WindowStyle Hidden -Wait
$health = Invoke-RestMethod -Uri 'http://127.0.0.1:4174/api/health' -TimeoutSec 2
if ($health.app -ne 'explore-shoot' -or $health.audience -ne 'user') { throw 'Start the project first.' }
try { $existing = Invoke-RestMethod -Uri "$origin/__phone_health" -TimeoutSec 2 } catch { $existing = $null }
if ($existing -and $existing.app -eq 'explore-shoot-phone') { Write-Output "Phone URL: $origin"; exit 0 }
$bridgeScript = Join-Path $projectDirectory 'tools/phone-bridge.cjs'
$bridgeProcess = Start-Process -FilePath $nodePath -ArgumentList ('"' + $bridgeScript + '"'), "--lan=$Address" -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectDirectory 'phone-test.log') -RedirectStandardError (Join-Path $projectDirectory 'phone-test-error.log') -PassThru
Set-Content -LiteralPath (Join-Path $projectDirectory '.phone-test.pid') -Value $bridgeProcess.Id
for ($attempt = 0; $attempt -lt 25; $attempt++) {
    Start-Sleep -Milliseconds 200
    try {
        $ready = Invoke-RestMethod -Uri "$origin/__phone_health" -TimeoutSec 1
        if ($ready.app -eq 'explore-shoot-phone') { Write-Output "Phone URL: $origin"; Write-Output 'Connect phone and PC to the same Wi-Fi. Camera and GPS need HTTPS.'; exit 0 }
    } catch {}
}
throw 'Phone bridge did not start. See phone-test-error.log.'
