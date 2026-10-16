param([switch]$ConfirmedPublicTest, [switch]$NoBrowser, [string]$EdgeAddress, [string]$BindAddress)
$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
$recordPath = Join-Path $projectDirectory 'data/https-test.json'
$tunnelExecutable = Join-Path $projectDirectory 'tools/bin/cloudflared.exe'
. (Join-Path $projectDirectory 'tools/java-runtime.ps1')
$runtime = Get-ProjectJavaRuntime
$bridgeScript = $runtime.Jar
$entryGenerator = Join-Path $projectDirectory 'tools/project-tool.ps1'
if (-not $ConfirmedPublicTest) {
    Write-Output 'This opens the USER website on the public internet. Admin stays local. PC must stay on.'
    if ((Read-Host 'Type YES to start the temporary HTTPS test') -cne 'YES') { exit 0 }
}
if (-not (Test-Path -LiteralPath $tunnelExecutable)) { throw 'Download the official cloudflared executable to tools/bin/cloudflared.exe first. See the phone testing guide.' }
Start-Process powershell.exe -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + (Join-Path $projectDirectory 'start.ps1') + '"'), '-NoBrowser' -WindowStyle Hidden -Wait
if (Test-Path -LiteralPath $recordPath) {
    $existing = Get-Content -LiteralPath $recordPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($existing.origin -notmatch '^https://[a-z0-9-]+\.trycloudflare\.com$') { throw 'Recorded HTTPS origin is invalid.' }
    $oldTunnel = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$existing.tunnelPid)"
    $oldBridge = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$existing.bridgePid)"
    $legacyBridge = Join-Path $projectDirectory 'tools/phone-bridge.cjs'
    $runtimeDirectory = Join-Path $projectDirectory 'tools/bin/backend-runtime'
    $verifiedBridge = $oldBridge -and $oldBridge.CommandLine.Contains('--public') -and (($oldBridge.Name -eq 'node.exe' -and $oldBridge.CommandLine.Contains($legacyBridge)) -or ($oldBridge.Name -eq 'java.exe' -and $oldBridge.CommandLine.Contains($runtimeDirectory) -and $oldBridge.CommandLine.Contains('--tool=phone-bridge')))
    if ($oldTunnel -and $verifiedBridge -and $oldTunnel.ExecutablePath -eq $tunnelExecutable -and $oldTunnel.CommandLine.Contains('http://127.0.0.1:4179')) {
        # Upgrade only the verified bridge; preserve the approved tunnel and phone URL.
        if (-not ($oldBridge.Name -eq 'java.exe' -and $oldBridge.CommandLine.Contains($bridgeScript))) {
            Stop-Process -Id $oldBridge.ProcessId
            Start-Sleep -Milliseconds 300
            $previousOrigin = $env:PUBLIC_TEST_ORIGIN
            try {
                $env:PUBLIC_TEST_ORIGIN = $existing.origin
                $replacement = Start-Process -FilePath $runtime.Java -ArgumentList '-jar', ('"' + $runtime.Jar + '"'), '--tool=phone-bridge', '--public' -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectDirectory 'https-bridge.log') -RedirectStandardError (Join-Path $projectDirectory 'https-bridge-error.log') -PassThru
                $existing.bridgePid = $replacement.Id
                $existing | ConvertTo-Json | Set-Content -LiteralPath $recordPath -Encoding UTF8
            } finally { $env:PUBLIC_TEST_ORIGIN = $previousOrigin }
        }
        $ready = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            try { $status = Invoke-RestMethod -Uri 'http://127.0.0.1:4179/__phone_health' -Headers @{ Host = ([uri]$existing.origin).Host } -TimeoutSec 1; if ($status.backend -eq 'java' -and $status.origin -eq $existing.origin) { $ready = $true; break } } catch {}
            Start-Sleep -Milliseconds 200
        }
        if (-not $ready) { throw 'The upgraded HTTPS bridge is not available; see https-bridge-error.log.' }
        Write-Output "HTTPS test URL: $($existing.origin)"
        & $entryGenerator -Tool phone-entry
        if ($LASTEXITCODE -ne 0) { throw 'Could not update the phone QR entry page.' }
        if (-not $NoBrowser) { Start-Process 'http://admin.localhost:4176/phone-test.html' }
        exit 0
    }
    & (Join-Path $projectDirectory 'stop-https-test.ps1')
}
$health = Invoke-RestMethod -Uri 'http://127.0.0.1:4174/api/health' -TimeoutSec 2
if ($health.app -ne 'explore-shoot' -or $health.audience -ne 'user') { throw 'The local project is not available.' }
$networkAddresses = & $runtime.Java '-jar' $runtime.Jar '--tool=addresses' | ConvertFrom-Json
$allNetworkAddresses = & $runtime.Java '-jar' $runtime.Jar '--tool=addresses' '--include-virtual' | ConvertFrom-Json
$hasVirtualDns = @($allNetworkAddresses | Where-Object { $_.address -like '198.18.*' }).Count -gt 0
if ($hasVirtualDns -and -not $EdgeAddress) {
    # Per-process workaround for proxy fake DNS; never edits global DNS or proxy settings.
    $EdgeAddress = '198.41.192.167:7844'
    if (-not $BindAddress) {
        $physicalInterface = $networkAddresses | Where-Object { $_.name -match 'WLAN|Wi-Fi|Wireless' } | Select-Object -First 1
        if (-not $physicalInterface) { $physicalInterface = $networkAddresses | Select-Object -First 1 }
        if ($physicalInterface) { $BindAddress = $physicalInterface.address }
    }
}
if ($BindAddress -and -not ($networkAddresses | Where-Object { $_.address -eq $BindAddress })) { throw 'BindAddress must belong to this computer.' }
if ($EdgeAddress -and $EdgeAddress -notmatch '^198\.41\.(192|200)\.[0-9]{1,3}:7844$') { throw 'EdgeAddress must be a Cloudflare Tunnel IPv4 address on port 7844.' }
$tunnelLog = Join-Path $projectDirectory 'https-tunnel.log'
$tunnelProcess = $null
$bridgeProcess = $null
$previousOrigin = $env:PUBLIC_TEST_ORIGIN
try {
    # Explicit configuration keeps unrelated user Cloudflare settings untouched.
    Set-Content -LiteralPath (Join-Path $projectDirectory 'data/https-tunnel.yml') -Value '{}' -Encoding ASCII
    Set-Content -LiteralPath $tunnelLog -Value '' -Encoding ASCII
    $tunnelArguments = @('tunnel', '--config', ('"' + (Join-Path $projectDirectory 'data/https-tunnel.yml') + '"'), '--url', 'http://127.0.0.1:4179', '--protocol', 'http2', '--no-autoupdate', '--logfile', ('"' + $tunnelLog + '"'))
    if ($EdgeAddress) { $tunnelArguments += @('--edge', $EdgeAddress) }
    if ($BindAddress) { $tunnelArguments += @('--edge-bind-address', $BindAddress) }
    $tunnelProcess = Start-Process -FilePath $tunnelExecutable -ArgumentList $tunnelArguments -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectDirectory 'https-tunnel-stdout.log') -RedirectStandardError (Join-Path $projectDirectory 'https-tunnel-error.log') -PassThru
    for ($attempt = 0; $attempt -lt 120; $attempt++) {
        Start-Sleep -Milliseconds 500
        $tunnelProcess.Refresh()
        if ($tunnelProcess.HasExited) { throw 'Cloudflare stopped before creating a URL. See https-tunnel-error.log.' }
        $logs = (Get-Content -LiteralPath $tunnelLog -Raw -ErrorAction SilentlyContinue) + (Get-Content -LiteralPath (Join-Path $projectDirectory 'https-tunnel-error.log') -Raw -ErrorAction SilentlyContinue)
        $match = [regex]::Match($logs, 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($match.Success) { $origin = $match.Value; break }
    }
    if (-not $origin) { throw 'Cloudflare did not provide a test URL. See https-tunnel-error.log.' }
    $env:PUBLIC_TEST_ORIGIN = $origin
    $bridgeProcess = Start-Process -FilePath $runtime.Java -ArgumentList '-jar', ('"' + $runtime.Jar + '"'), '--tool=phone-bridge', '--public' -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectDirectory 'https-bridge.log') -RedirectStandardError (Join-Path $projectDirectory 'https-bridge-error.log') -PassThru
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 200
        try {
            $bridgeHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:4179/__phone_health' -Headers @{ Host = ([uri]$origin).Host } -TimeoutSec 1
            if ($bridgeHealth.secure -and $bridgeHealth.origin -eq $origin) { $ready = $true; break }
        } catch {}
    }
    if (-not $ready) { throw 'The HTTPS user bridge did not start. See https-bridge-error.log.' }
    $registered = $false
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
        $tunnelProcess.Refresh()
        if ($tunnelProcess.HasExited) { throw 'Cloudflare exited before connecting to its edge.' }
        if ((Get-Content -LiteralPath $tunnelLog -Raw) -match 'Registered tunnel connection') { $registered = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $registered) { throw 'The temporary URL was created but the tunnel did not connect. See https-tunnel.log.' }
    @{ origin = $origin; tunnelPid = $tunnelProcess.Id; bridgePid = $bridgeProcess.Id; createdAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $recordPath -Encoding UTF8
    Write-Output "HTTPS test URL: $origin"
    Write-Output 'Admin remains local. Close with stop-https-test.ps1 or the HTTPS stop launcher.'
    & $entryGenerator -Tool phone-entry
    if ($LASTEXITCODE -ne 0) { throw 'Could not update the phone QR entry page.' }
    if (-not $NoBrowser) { Start-Process 'http://admin.localhost:4176/phone-test.html' }
} catch {
    if ($bridgeProcess -and -not $bridgeProcess.HasExited) { Stop-Process -Id $bridgeProcess.Id -ErrorAction SilentlyContinue }
    if ($tunnelProcess -and -not $tunnelProcess.HasExited) { Stop-Process -Id $tunnelProcess.Id -ErrorAction SilentlyContinue }
    throw
} finally { $env:PUBLIC_TEST_ORIGIN = $previousOrigin }
