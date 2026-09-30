$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot '.server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'No recorded server process.'; exit 0 }
$serverPid = [int](Get-Content -LiteralPath $pidFile)
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$serverPid"
$expectedScript = Join-Path $PSScriptRoot 'server.cjs'
if ($process -and $process.Name -eq 'node.exe' -and $process.CommandLine.Contains($expectedScript)) {
    Stop-Process -Id $serverPid
    Remove-Item -LiteralPath $pidFile
    Write-Output 'Explore & Capture stopped. Saved data is preserved.'
} elseif ($process) { throw 'The recorded process does not match this project. No process was stopped.' }
else { Remove-Item -LiteralPath $pidFile; Write-Output 'The server is already stopped.' }
