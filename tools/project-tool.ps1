param([Parameter(Mandatory=$true)][string]$Tool, [Parameter(ValueFromRemainingArguments=$true)][string[]]$ToolArguments)
$ErrorActionPreference = 'Stop'
# Decode native Java output consistently in Windows PowerShell, including Chinese tool messages.
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
. (Join-Path $PSScriptRoot 'java-runtime.ps1')
$runtime = Get-ProjectJavaRuntime
Push-Location $runtime.Root
try { & $runtime.Java '-Dfile.encoding=UTF-8' '-Dstdout.encoding=UTF-8' '-Dstderr.encoding=UTF-8' '-jar' $runtime.Jar "--tool=$Tool" @ToolArguments; if ($LASTEXITCODE -ne 0) { throw 'Java project tool failed.' } } finally { Pop-Location }
