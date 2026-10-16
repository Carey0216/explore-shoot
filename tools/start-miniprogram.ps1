param(
    [ValidateSet('Phone','Local','Production')][string]$Target='Phone',
    [string]$ApiBase,
    [string]$CliPath,
    [switch]$NoBackend
)
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$miniDirectory = Join-Path $projectDirectory 'miniprogram'
if (-not $ApiBase) {
    if ($Target -eq 'Local') { $ApiBase='http://127.0.0.1:4174' }
    else {
        $serverConfiguration=Join-Path (Split-Path -Parent $projectDirectory) 'explore-shoot-部署配置/server.json'
        if (-not (Test-Path -LiteralPath $serverConfiguration)) { throw 'Pass -ApiBase https://your-backend.example, or select -Target Local for the computer simulator.' }
        $ApiBase=[string]((Get-Content -LiteralPath $serverConfiguration -Raw -Encoding UTF8 | ConvertFrom-Json).publicOrigin)
    }
}
$backendAddress = $null
if (-not [Uri]::TryCreate($ApiBase, [UriKind]::Absolute, [ref]$backendAddress) -or
    $backendAddress.AbsolutePath -ne '/' -or $backendAddress.Query -or $backendAddress.UserInfo -or
    $backendAddress.Fragment -or ($backendAddress.Scheme -ne 'https' -and
    -not ($backendAddress.Scheme -eq 'http' -and $backendAddress.Host -in @('127.0.0.1', 'localhost')))) {
    throw 'Use an HTTPS backend origin, or a loopback HTTP origin for local development.'
}
$isLoopback=$backendAddress.Host -in @('127.0.0.1','localhost')
if ($Target -ne 'Local' -and $isLoopback) { throw 'A phone cannot reach the computer through 127.0.0.1. Select -Target Local only for the computer simulator.' }
if ($Target -eq 'Production' -and ($backendAddress.Scheme -ne 'https' -or [Uri]::CheckHostName($backendAddress.Host) -ne [UriHostNameType]::Dns)) {
    throw 'Production requires a configured HTTPS domain; an IP address is for development debugging only.'
}
if (-not $NoBackend -and $backendAddress.Host -in @('127.0.0.1', 'localhost') -and $backendAddress.Port -eq 4174) {
    & (Join-Path $projectDirectory 'start.ps1') -NoBrowser
}
$probe=Invoke-RestMethod -Uri ($ApiBase.TrimEnd('/')+'/api/mini/config') -TimeoutSec 20
if ($probe.apiVersion -ne 1) { throw 'This address is not a compatible mini-program backend. The previous configuration was kept.' }
if ($Target -eq 'Production') {
    $identity=Invoke-RestMethod -Uri ($ApiBase.TrimEnd('/')+'/api/runtime') -TimeoutSec 20
    if ($identity.name -ne 'production' -or $probe.wechatTestLogin) { throw 'Production package requires a production backend without WeChat test login. Configuration was not changed.' }
}
$development = $Target -ne 'Production'
$configuration = @{ apiBase = $ApiBase.TrimEnd('/'); development = $development; target=$Target.ToLowerInvariant() } | ConvertTo-Json -Compress
('module.exports = ' + $configuration + ';') | Set-Content -LiteralPath (Join-Path $miniDirectory 'config.local.js') -Encoding utf8
@{ setting = @{ urlCheck = -not $development } } | ConvertTo-Json -Depth 5 |
    Set-Content -LiteralPath (Join-Path $miniDirectory 'project.private.config.json') -Encoding utf8
if (-not $CliPath) {
    $locations = @('HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/*',
        'HKLM:/Software/Microsoft/Windows/CurrentVersion/Uninstall/*',
        'HKLM:/Software/WOW6432Node/Microsoft/Windows/CurrentVersion/Uninstall/*')
    $installation = Get-ItemProperty $locations -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -match '微信.*开发|WeChat.*Dev' } | Select-Object -First 1
    if ($installation.DisplayIcon) { $CliPath = Join-Path (Split-Path -Parent $installation.DisplayIcon.Trim('"')) 'cli.bat' }
}
if (-not $CliPath -or -not (Test-Path -LiteralPath $CliPath)) {
    throw 'Install WeChat developer tools or pass -CliPath. Import the miniprogram directory manually if preferred.'
}
& $CliPath open --project $miniDirectory
if ($LASTEXITCODE -ne 0) { throw 'Could not open WeChat developer tools.' }
Write-Output 'Local development configuration is ignored by Git. Preview is not a WeChat public release.'
Write-Output ('Backend: '+$ApiBase+' / profile: '+$Target)
if ($Target -eq 'Phone') { Write-Output 'Recompile and rescan. IP-based testing requires WeChat debugging mode; formal release requires a registered HTTPS domain.' }
if ($Target -eq 'Local') { Write-Output 'Computer simulator only. Do not scan this loopback configuration on a phone.' }
