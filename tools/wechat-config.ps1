# Local Windows configuration uses DPAPI and stays beside, not inside, the Git repository.
function Get-ProjectWechatEnvironment {
    param([string]$ProjectDirectory)
    $configurationPath = Join-Path (Split-Path -Parent $ProjectDirectory) 'explore-shoot-部署配置/wechat.local.json'
    if (-not (Test-Path -LiteralPath $configurationPath)) { return @{} }
    $configuration = Get-Content -LiteralPath $configurationPath -Raw | ConvertFrom-Json
    if ($configuration.appId -notmatch '^wx[a-f0-9]{16}$' -or -not $configuration.protectedSecret) {
        throw 'Invalid local WeChat configuration. Run tools/configure-wechat.ps1 again.'
    }
    $secure = ConvertTo-SecureString $configuration.protectedSecret
    $pointer = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return @{ WECHAT_APP_ID = [string]$configuration.appId; WECHAT_APP_SECRET = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    } finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
