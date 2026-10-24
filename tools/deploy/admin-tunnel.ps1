param([string]$ConfigPath='',[switch]$Close)
$ErrorActionPreference='Stop'
$deploymentProject=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (!$ConfigPath) { $ConfigPath=Join-Path (Split-Path $deploymentProject -Parent) 'explore-shoot-部署配置/server.json' }
$deploymentConfig=Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$deploymentConfigDirectory=Split-Path -Parent $ConfigPath
$deploymentTunnelPidFile=Join-Path $deploymentConfigDirectory 'admin-tunnel.pid'
$deploymentTunnelPort=[int]$deploymentConfig.adminLocalPort
if ($deploymentTunnelPort -lt 1024 -or $deploymentTunnelPort -gt 65535 -or $deploymentConfig.server -notmatch '^\d{1,3}(\.\d{1,3}){3}$' -or $deploymentConfig.username -notmatch '^[a-z_][a-z0-9_-]*$') { throw 'Invalid tunnel configuration' }
function Wait-CloudAdministration {
    for ($deploymentAttempt=0; $deploymentAttempt -lt 12; $deploymentAttempt++) {
        try {
            $deploymentRequest=[Net.HttpWebRequest]::Create('http://127.0.0.1:'+$deploymentTunnelPort+'/api/health')
            $deploymentRequest.Proxy=$null
            $deploymentRequest.Timeout=8000
            $deploymentResponse=$deploymentRequest.GetResponse()
            try {
                $deploymentReader=[IO.StreamReader]::new($deploymentResponse.GetResponseStream())
                try { $deploymentHealth=$deploymentReader.ReadToEnd() | ConvertFrom-Json } finally { $deploymentReader.Dispose() }
            } finally { $deploymentResponse.Dispose() }
            if ($deploymentHealth.audience -eq 'admin' -and $deploymentHealth.backend -eq 'java') { return }
        } catch { }
        if(Test-Path -LiteralPath $deploymentTunnelPidFile){
            $deploymentCheckingPid=[int](Get-Content -LiteralPath $deploymentTunnelPidFile)
            if(!(Get-Process -Id $deploymentCheckingPid -ErrorAction SilentlyContinue)){throw 'SSH tunnel process exited; see admin-tunnel.log'}
        }
        Start-Sleep -Milliseconds 500
    }
    throw 'Cloud administration connection not ready; check admin-tunnel.log before opening the page'
}
if (Test-Path -LiteralPath $deploymentTunnelPidFile) {
    $deploymentRecordedPid=[int](Get-Content -LiteralPath $deploymentTunnelPidFile)
    $deploymentRecordedProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$deploymentRecordedPid"
    if ($deploymentRecordedProcess) {
        if ($deploymentRecordedProcess.Name -ne 'ssh.exe' -or !$deploymentRecordedProcess.CommandLine.Contains($deploymentConfig.privateKey) -or !$deploymentRecordedProcess.CommandLine.Contains('127.0.0.1:'+$deploymentTunnelPort+':127.0.0.1:4176')) { throw 'Recorded process is not the expected administration tunnel' }
        if ($Close) { Stop-Process -Id $deploymentRecordedPid; Remove-Item -LiteralPath $deploymentTunnelPidFile; Write-Output 'Administration tunnel closed'; exit 0 }
        Wait-CloudAdministration
        Write-Output ('Cloud administration: http://localhost:'+$deploymentTunnelPort); exit 0
    }
    Remove-Item -LiteralPath $deploymentTunnelPidFile
}
if ($Close) { Write-Output 'Administration tunnel is already closed'; exit 0 }
$deploymentFingerprint=ssh-keygen -lf $deploymentConfig.knownHosts
if ($LASTEXITCODE -ne 0 -or $deploymentFingerprint -notmatch [regex]::Escape($deploymentConfig.hostFingerprint)) { throw 'Host fingerprint mismatch' }
foreach ($deploymentFile in $deploymentConfig.privateKey,$deploymentConfig.knownHosts) { if ($deploymentFile.Contains('"') -or !(Test-Path -LiteralPath $deploymentFile)) { throw 'Invalid SSH file path' } }
$deploymentTunnelArgs=@('-N','-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','ConnectTimeout=30','-o','StrictHostKeyChecking=yes','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=30','-o','ServerAliveCountMax=3','-i',$deploymentConfig.privateKey,'-o',('UserKnownHostsFile='+$deploymentConfig.knownHosts),'-L',('127.0.0.1:'+$deploymentTunnelPort+':127.0.0.1:4176'),($deploymentConfig.username+'@'+$deploymentConfig.server))
. (Join-Path $PSScriptRoot 'ssh-transport.ps1')
$deploymentTransportOptions=@(Get-ProjectSshTransportOptions -ConfigPath $ConfigPath)
$deploymentTunnelArgs=$deploymentTransportOptions+$deploymentTunnelArgs
$deploymentTunnelCommand=($deploymentTunnelArgs | ForEach-Object {ConvertTo-ProjectProcessArgument $_}) -join ' '
$deploymentTunnel=Start-Process -FilePath (Get-Command ssh).Source -ArgumentList $deploymentTunnelCommand -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $deploymentConfigDirectory 'admin-tunnel.log')
$deploymentTunnel.Id | Set-Content -LiteralPath $deploymentTunnelPidFile
Wait-CloudAdministration
Write-Output ('Cloud administration: http://localhost:'+$deploymentTunnelPort)
