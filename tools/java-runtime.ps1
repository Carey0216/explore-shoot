# Shared launcher for the Java application and project tools; no Node server is started.
function Get-ProjectJavaRuntime {
    $projectDirectory = Split-Path -Parent $PSScriptRoot
    $javaPath = (Get-Command java -ErrorAction Stop).Source
    $jar = Join-Path $projectDirectory 'backend/target/explore-shoot-backend.jar'
    $sources = @(Get-ChildItem -LiteralPath (Join-Path $projectDirectory 'backend/src') -Recurse -File) + @(Get-Item -LiteralPath (Join-Path $projectDirectory 'backend/pom.xml'))
    $needsBuild = -not (Test-Path -LiteralPath $jar)
    if (-not $needsBuild) { $builtAt = (Get-Item -LiteralPath $jar).LastWriteTimeUtc; $needsBuild = @($sources | Where-Object { $_.LastWriteTimeUtc -gt $builtAt }).Count -gt 0 }
    if ($needsBuild) { & (Join-Path $PSScriptRoot 'build-backend.ps1') -SkipTests | Out-Host; if (-not $?) { throw 'Java build failed.' } }
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    try { $bytes = [System.IO.File]::ReadAllBytes($jar); $hash = [BitConverter]::ToString($hasher.ComputeHash($bytes)).Replace('-','').ToLower() } finally { $hasher.Dispose() }
    $runtimeDirectory = Join-Path $PSScriptRoot 'bin/backend-runtime'
    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
    $runtimeJar = Join-Path $runtimeDirectory ($hash + '.jar')
    if (-not (Test-Path -LiteralPath $runtimeJar)) { [System.IO.File]::WriteAllBytes($runtimeJar,$bytes) }
    return [pscustomobject]@{Java=$javaPath; Jar=$runtimeJar; Hash=$hash; Root=$projectDirectory}
}
