param([string]$ApiBase='', [string]$Model='')
$ErrorActionPreference='Stop'
if(!$ApiBase){$ApiBase=Read-Host 'API base URL (for example https://your-provider/v1; leave empty to cancel)'}
if(!$ApiBase){Write-Output 'No model configuration changed.';return}
if(!$Model){$Model=Read-Host 'Model identifier'}
$uri=$null
if(![Uri]::TryCreate($ApiBase,[UriKind]::Absolute,[ref]$uri) -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or ($uri.Scheme -ne 'https' -and !($uri.Scheme -eq 'http' -and $uri.IsLoopback))){throw 'Use HTTPS or an explicitly configured loopback proxy.'}
if(!$Model -or $Model.Length -gt 150 -or $Model -match '[\r\n]'){throw 'Invalid model identifier'}
$secret=Read-Host 'API Key (hidden; never paste it into chat)' -AsSecureString
if(!$secret.Length -or $secret.Length -gt 1000){throw 'Invalid API Key'}
Add-Type -AssemblyName System.Security
$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
$bytes=$null
try{
  $bytes=[Text.Encoding]::UTF8.GetBytes([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))
  $protected=[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))
}finally{if($bytes){[Array]::Clear($bytes,0,$bytes.Length)};[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);$secret.Dispose()}
$projectDirectory=Split-Path -Parent $PSScriptRoot
$configurationDirectory=Join-Path (Split-Path -Parent $projectDirectory) 'explore-shoot-部署配置'
New-Item -ItemType Directory -Path $configurationDirectory -Force|Out-Null
$path=Join-Path $configurationDirectory 'assistant.local.json'
@{apiBase=$ApiBase.TrimEnd('/');model=$Model;protectedSecret=$protected;protectionFormat='dpapi-v1'}|ConvertTo-Json|Set-Content -LiteralPath $path -Encoding utf8
Write-Output 'Model configuration encrypted outside the repository. Restart the local application or Development environment to apply it. Nothing was sent to the server.'
