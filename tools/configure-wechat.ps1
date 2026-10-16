param([string]$AppId = 'wxd52e9ecd6a2b1693', [switch]$NoRestart, [switch]$TestLogin)
$ErrorActionPreference = 'Stop'
if ($AppId -notmatch '^wx[a-f0-9]{16}$') { throw 'AppID is invalid.' }
$projectDirectory = Split-Path -Parent $PSScriptRoot
$configurationDirectory = Join-Path (Split-Path -Parent $projectDirectory) 'explore-shoot-部署配置'
$secret = Read-Host 'Enter AppSecret locally (hidden; never paste it into chat)' -AsSecureString
if ($secret.Length -eq 0) { throw 'AppSecret must not be empty.' }
Add-Type -AssemblyName System.Security
$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
$secretBytes=$null
try {
    $secretBytes=[Text.Encoding]::UTF8.GetBytes([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))
    $protectedBytes=[Security.Cryptography.ProtectedData]::Protect($secretBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    $protected=[Convert]::ToBase64String($protectedBytes)
} finally {
    if ($secretBytes) { [Array]::Clear($secretBytes,0,$secretBytes.Length) }
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $secret.Dispose()
}
New-Item -ItemType Directory -Path $configurationDirectory -Force | Out-Null
$configurationPath = Join-Path $configurationDirectory 'wechat.local.json'
@{ appId = $AppId; protectedSecret = $protected; protectionFormat='dpapi-v1'; protectedBy = 'Windows DPAPI current user'; loginMode = $(if ($TestLogin) { 'test' } else { 'bound' }) } |
    ConvertTo-Json | Set-Content -LiteralPath $configurationPath -Encoding utf8
Write-Output 'WeChat configuration was encrypted for this Windows account outside the repository.'
if (-not $NoRestart) {
    & (Join-Path $projectDirectory 'stop.ps1')
    & (Join-Path $projectDirectory 'start.ps1') -NoBrowser
}
