param([string]$AppId = 'wxd52e9ecd6a2b1693', [switch]$NoRestart)
$ErrorActionPreference = 'Stop'
if ($AppId -notmatch '^wx[a-f0-9]{16}$') { throw 'AppID is invalid.' }
$projectDirectory = Split-Path -Parent $PSScriptRoot
$configurationDirectory = Join-Path (Split-Path -Parent $projectDirectory) 'explore-shoot-部署配置'
$secret = Read-Host 'Enter AppSecret locally (hidden; never paste it into chat)' -AsSecureString
if ($secret.Length -eq 0) { throw 'AppSecret must not be empty.' }
$protected = ConvertFrom-SecureString $secret
New-Item -ItemType Directory -Path $configurationDirectory -Force | Out-Null
$configurationPath = Join-Path $configurationDirectory 'wechat.local.json'
@{ appId = $AppId; protectedSecret = $protected; protectedBy = 'Windows DPAPI current user' } |
    ConvertTo-Json | Set-Content -LiteralPath $configurationPath -Encoding utf8
Write-Output 'WeChat configuration was encrypted for this Windows account outside the repository.'
if (-not $NoRestart) {
    & (Join-Path $projectDirectory 'stop.ps1')
    & (Join-Path $projectDirectory 'start.ps1') -NoBrowser
}
