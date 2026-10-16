$ErrorActionPreference = 'Stop'
$recordPath = Join-Path $PSScriptRoot 'data/https-test.json'
if (-not (Test-Path -LiteralPath $recordPath)) {
    & (Join-Path $PSScriptRoot 'tools/project-tool.ps1') -Tool phone-entry --stopped
    Write-Output 'No recorded HTTPS test.'; exit 0
}
$record = Get-Content -LiteralPath $recordPath -Raw -Encoding UTF8 | ConvertFrom-Json
$expectedTunnel = Join-Path $PSScriptRoot 'tools/bin/cloudflared.exe'
$expectedBridge = Join-Path $PSScriptRoot 'tools/phone-bridge.cjs'
$javaRuntimeDirectory = Join-Path $PSScriptRoot 'tools/bin/backend-runtime'
$targets = @()
foreach ($kind in @('tunnel', 'bridge')) {
    $processId = if ($kind -eq 'tunnel') { [int]$record.tunnelPid } else { [int]$record.bridgePid }
    $entry = Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
    if (-not $entry) { continue }
    $matches = if ($kind -eq 'tunnel') { $entry.ExecutablePath -eq $expectedTunnel -and $entry.CommandLine.Contains('http://127.0.0.1:4179') } else { (($entry.Name -eq 'node.exe' -and $entry.CommandLine.Contains($expectedBridge)) -or ($entry.Name -eq 'java.exe' -and $entry.CommandLine.Contains($javaRuntimeDirectory) -and $entry.CommandLine.Contains('--tool=phone-bridge'))) -and $entry.CommandLine.Contains('--public') }
    if (-not $matches) { throw 'Recorded process identity does not match this HTTPS test. No process was stopped.' }
    $targets += $processId
}
foreach ($processId in $targets) { Stop-Process -Id $processId }
Remove-Item -LiteralPath $recordPath
& (Join-Path $PSScriptRoot 'tools/project-tool.ps1') -Tool phone-entry --stopped
Write-Output 'HTTPS public test stopped. Local project, LAN test and data are preserved.'
