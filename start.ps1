param([switch]$NoBrowser, [switch]$Admin)
$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
$release = (Get-Content -LiteralPath (Join-Path $projectDirectory 'package.json') -Raw | ConvertFrom-Json).version
$backendJar = Join-Path $projectDirectory 'backend/target/explore-shoot-backend.jar'
$sources = @(Get-ChildItem -LiteralPath (Join-Path $projectDirectory 'backend/src') -Recurse -File) + @(Get-Item -LiteralPath (Join-Path $projectDirectory 'backend/pom.xml'))
$needsBuild = -not (Test-Path -LiteralPath $backendJar)
if (-not $needsBuild) { $builtAt = (Get-Item -LiteralPath $backendJar).LastWriteTimeUtc; $needsBuild = @($sources | Where-Object { $_.LastWriteTimeUtc -gt $builtAt }).Count -gt 0 }
if ($needsBuild) { & (Join-Path $projectDirectory 'tools/build-backend.ps1'); if (-not $?) { throw 'Java build failed.' } }
$builtHash = (Get-FileHash -LiteralPath $backendJar -Algorithm SHA256).Hash.ToLower()
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
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw 'Node.js 20 or newer is required for the project tools.' }
if (-not (Get-Command java -ErrorAction SilentlyContinue)) { throw 'JDK 21 or newer is required for the Java backend.' }
$serverScript = Join-Path $projectDirectory 'server.cjs'
$serverProcess = Start-Process -FilePath $nodeCommand.Source -ArgumentList ('"' + $serverScript + '"') -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectDirectory 'server.log') -RedirectStandardError (Join-Path $projectDirectory 'server-error.log') -PassThru
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
