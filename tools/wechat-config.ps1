# Local Windows configuration uses DPAPI and stays beside, not inside, the Git repository.
function Get-ProjectWechatEnvironment {
    param([string]$ProjectDirectory)
    $configurationPath = Join-Path (Split-Path -Parent $ProjectDirectory) 'explore-shoot-部署配置/wechat.local.json'
    if (-not (Test-Path -LiteralPath $configurationPath)) { return @{} }
    $configuration = Get-Content -LiteralPath $configurationPath -Raw | ConvertFrom-Json
    if ($configuration.appId -notmatch '^wx[a-f0-9]{16}$' -or -not $configuration.protectedSecret) {
        throw 'Invalid local WeChat configuration. Run tools/configure-wechat.ps1 again.'
    }
    Add-Type -AssemblyName System.Security
    $bytes=$null
    $pointer=[IntPtr]::Zero
    try {
        if ($configuration.protectionFormat -eq 'dpapi-v1') {
            $bytes=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($configuration.protectedSecret),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
            $plainSecret=[Text.Encoding]::UTF8.GetString($bytes)
        } else {
            # Compatibility with the original locally stored SecureString format.
            $secure = ConvertTo-SecureString $configuration.protectedSecret
            $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
            $plainSecret=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        }
        $mode=if ($configuration.loginMode -in @('test','bound','production','off')) { [string]$configuration.loginMode } else { 'bound' }
        return @{ WECHAT_APP_ID = [string]$configuration.appId; WECHAT_APP_SECRET=$plainSecret; WECHAT_LOGIN_MODE=$mode }
    } finally {
        if ($bytes) { [Array]::Clear($bytes,0,$bytes.Length) }
        if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        $plainSecret=$null
    }
}
