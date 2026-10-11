$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot '.server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'No recorded server process.'; exit 0 }
$serverPid = [int](Get-Content -LiteralPath $pidFile)
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$serverPid"
$expectedScript = Join-Path $PSScriptRoot 'server.cjs'
$expectedJava = Join-Path $PSScriptRoot 'tools/bin/backend-runtime'
$isLegacyNode = $process -and $process.Name -eq 'node.exe' -and $process.CommandLine.Contains($expectedScript)
$isProjectJava = $process -and $process.Name -eq 'java.exe' -and $process.CommandLine.Replace('/','\').Contains($expectedJava.Replace('/','\')) -and $process.CommandLine.Contains('-jar') -and -not $process.CommandLine.Contains('--tool=')
if ($isLegacyNode -or $isProjectJava) {
    # Stop only the recorded project JVM (or the pre-v6.1 launcher) and its model children.
    & taskkill.exe /PID $serverPid /T /F | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not stop the verified project process tree.' }
    Remove-Item -LiteralPath $pidFile
    Write-Output 'Explore & Capture stopped. Saved data is preserved.'
} elseif ($process) { throw 'The recorded process does not match this project. No process was stopped.' }
else { Remove-Item -LiteralPath $pidFile; Write-Output 'The server is already stopped.' }
