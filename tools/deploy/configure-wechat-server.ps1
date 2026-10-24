param([string]$ConfigPath)
$ErrorActionPreference='Stop'
$projectDirectory=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (!$ConfigPath) { $ConfigPath=Join-Path (Split-Path $projectDirectory -Parent) 'explore-shoot-部署配置/server.json' }
$server=Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$sshArguments=@('-i',$server.privateKey,'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','ConnectTimeout=30','-o','StrictHostKeyChecking=yes','-o',('UserKnownHostsFile='+$server.knownHosts))
. (Join-Path $PSScriptRoot 'ssh-transport.ps1')
$sshArguments+=@(Get-ProjectSshTransportOptions -ConfigPath $ConfigPath)
$target=$server.username+'@'+$server.server
if ($server.server -notmatch '^\d{1,3}(\.\d{1,3}){3}$' -or $server.publicOrigin -ne ('https://'+$server.server)) { throw 'Invalid deployment target' }
$fingerprint=ssh-keygen -lf $server.knownHosts
if ($LASTEXITCODE -ne 0 -or $fingerprint -notmatch [regex]::Escape($server.hostFingerprint)) { throw 'Server fingerprint mismatch' }
$health=Invoke-RestMethod -Uri ($server.publicOrigin+'/api/health') -TimeoutSec 20
$expected=(Get-Content -LiteralPath (Join-Path $projectDirectory 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
if ($health.release -ne $expected -or $health.backend -ne 'java') { throw 'Deploy the fixed application version before configuring WeChat' }
. (Join-Path $projectDirectory 'tools/wechat-config.ps1')
$configuration=Get-ProjectWechatEnvironment -ProjectDirectory $projectDirectory
if (!$configuration.WECHAT_APP_SECRET) { throw 'Complete the local hidden-input configuration first' }
try {
    scp @sshArguments (Join-Path $PSScriptRoot 'configure-wechat.py') ($target+':/opt/explore-shoot/incoming/configure-wechat.py')
    if ($LASTEXITCODE -ne 0) { throw 'Configuration helper transfer failed' }
    # The secret is stdin data inside verified SSH, never a process argument or a temporary plaintext file.
    ($configuration | ConvertTo-Json -Compress) | ssh @sshArguments $target 'python3 /opt/explore-shoot/incoming/configure-wechat.py'
    if ($LASTEXITCODE -ne 0) { throw 'Remote configuration failed; inspect service status without printing its environment' }
} finally { $configuration.Clear() }
