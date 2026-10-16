function Get-ProjectAssistantEnvironment {
    param([string]$ProjectDirectory)
    $path=Join-Path (Split-Path -Parent $ProjectDirectory) 'explore-shoot-部署配置/assistant.local.json'
    if(!(Test-Path -LiteralPath $path)){return @{}}
    $configuration=Get-Content -LiteralPath $path -Raw|ConvertFrom-Json
    if($configuration.protectionFormat -ne 'dpapi-v1'){throw 'Invalid local model configuration'}
    Add-Type -AssemblyName System.Security
    $bytes=$null
    try{
        $bytes=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($configuration.protectedSecret),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
        return @{ASSISTANT_API_BASE=[string]$configuration.apiBase;ASSISTANT_MODEL=[string]$configuration.model;ASSISTANT_API_KEY=[Text.Encoding]::UTF8.GetString($bytes)}
    }finally{if($bytes){[Array]::Clear($bytes,0,$bytes.Length)}}
}
