param([switch]$NoBrowser, [switch]$Admin)
$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
$release = (Get-Content -LiteralPath (Join-Path $projectDirectory 'package.json') -Raw | ConvertFrom-Json).version
. (Join-Path $projectDirectory 'tools/java-runtime.ps1')
$runtime = Get-ProjectJavaRuntime
$builtHash = $runtime.Hash
$localUrl = 'http://127.0.0.1:4174'
$openUrl = if ($Admin) { 'http://admin.localhost:4176' } else { 'http://explore.localhost:4174' }
$existing = $null
try { $existing = Invoke-RestMethod -Uri "$localUrl/api/health" -TimeoutSec 2 } catch {}
if ($existing) {
    if ($existing.app -ne 'explore-shoot') { throw 'Port 4174 is already used by another application.' }
    if ($existing.version -eq 2 -and $existing.backend -eq 'java' -and $existing.release -eq $release -and $existing.build -eq $builtHash) {
        $adminHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:4176/api/health' -TimeoutSec 2
        if ($adminHealth.audience -ne 'admin') { throw 'Admin port 4176 is not available.' }
        if (-not $NoBrowser) { Start-Process $openUrl }
        Write-Output 'User: http://explore.localhost:4174 / Admin: http://admin.localhost:4176'
        exit 0
    }
    & (Join-Path $projectDirectory 'stop.ps1')
}
. (Join-Path $projectDirectory 'tools/wechat-config.ps1')
$wechatEnvironment = Get-ProjectWechatEnvironment -ProjectDirectory $projectDirectory
. (Join-Path $projectDirectory 'tools/assistant-config.ps1')
$assistantEnvironment=Get-ProjectAssistantEnvironment -ProjectDirectory $projectDirectory
foreach($key in $assistantEnvironment.Keys){$wechatEnvironment[$key]=$assistantEnvironment[$key]}
$assistantEnvironment.Clear()
$previousWechatEnvironment = @{}
try {
    foreach ($name in $wechatEnvironment.Keys) {
        $previousWechatEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $wechatEnvironment[$name], 'Process')
    }
    $serverProcess = Start-Process -FilePath $runtime.Java -ArgumentList '-Dfile.encoding=UTF-8', ('-Dexplore.build.hash=' + $runtime.Hash), '-jar', ('"' + $runtime.Jar + '"') -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectDirectory 'server.log') -RedirectStandardError (Join-Path $projectDirectory 'server-error.log') -PassThru
} finally {
    foreach ($name in $previousWechatEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $previousWechatEnvironment[$name], 'Process') }
    $wechatEnvironment.Clear()
}
Set-Content -LiteralPath (Join-Path $projectDirectory '.server.pid') -Value $serverProcess.Id
for ($attempt = 0; $attempt -lt 150; $attempt++) {
    Start-Sleep -Milliseconds 200
    try {
        $health = Invoke-RestMethod -Uri "$localUrl/api/health" -TimeoutSec 1
        if ($health.app -eq 'explore-shoot' -and $health.version -eq 2 -and $health.backend -eq 'java' -and $health.release -eq $release) {
            $adminHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:4176/api/health' -TimeoutSec 1
            if ($adminHealth.audience -ne 'admin') { continue }
            if (-not $NoBrowser) { Start-Process $openUrl }
            Write-Output 'User: http://explore.localhost:4174 / Admin: http://admin.localhost:4176'
            exit 0
        }
    } catch {}
}
throw 'Could not start the local server. See server-error.log.'
