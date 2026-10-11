$ErrorActionPreference = 'Stop'
Start-Process powershell.exe -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + (Join-Path $PSScriptRoot 'start.ps1') + '"'), '-NoBrowser' -WindowStyle Hidden -Wait
& (Join-Path $PSScriptRoot 'tools/project-tool.ps1') -Tool phone-entry
if ($LASTEXITCODE -ne 0) { throw 'Could not update the phone entry page.' }
Start-Process 'http://admin.localhost:4176/phone-test.html'
