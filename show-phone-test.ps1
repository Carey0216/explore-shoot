$ErrorActionPreference = 'Stop'
$nodePath = (Get-Command node -ErrorAction Stop).Source
Start-Process powershell.exe -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + (Join-Path $PSScriptRoot 'start.ps1') + '"'), '-NoBrowser' -WindowStyle Hidden -Wait
& $nodePath (Join-Path $PSScriptRoot 'tools/phone-entry.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Could not update the phone entry page.' }
Start-Process 'http://admin.localhost:4176/phone-test.html'
