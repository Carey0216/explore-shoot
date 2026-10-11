$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot '.phone-test.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'No recorded phone test process.'; exit 0 }
$phoneProcessId = [int](Get-Content -LiteralPath $pidFile)
$record = Get-CimInstance Win32_Process -Filter "ProcessId=$phoneProcessId"
$expectedScript = Join-Path $PSScriptRoot 'tools/phone-bridge.cjs'
$javaRuntimeDirectory = Join-Path $PSScriptRoot 'tools/bin/backend-runtime'
if ($record -and (($record.Name -eq 'node.exe' -and $record.CommandLine.Contains($expectedScript)) -or ($record.Name -eq 'java.exe' -and $record.CommandLine.Contains($javaRuntimeDirectory) -and $record.CommandLine.Contains('--tool=phone-bridge') -and $record.CommandLine.Contains('--lan=')))) {
    Stop-Process -Id $phoneProcessId
    Remove-Item -LiteralPath $pidFile
    Write-Output 'Phone test stopped. The local project and data are preserved.'
} elseif ($record) { throw 'The recorded process does not match the phone bridge. No process was stopped.' }
else { Remove-Item -LiteralPath $pidFile; Write-Output 'Phone test is already stopped.' }
