param([string]$ApiBase = 'http://127.0.0.1:4174', [string]$CliPath, [switch]$NoBackend)
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$miniDirectory = Join-Path $projectDirectory 'miniprogram'
$backendAddress = $null
if (-not [Uri]::TryCreate($ApiBase, [UriKind]::Absolute, [ref]$backendAddress) -or
    $backendAddress.AbsolutePath -ne '/' -or $backendAddress.Query -or $backendAddress.UserInfo -or
    $backendAddress.Fragment -or ($backendAddress.Scheme -ne 'https' -and
    -not ($backendAddress.Scheme -eq 'http' -and $backendAddress.Host -in @('127.0.0.1', 'localhost')))) {
    throw 'Use an HTTPS backend origin, or a loopback HTTP origin for local development.'
}
if (-not $NoBackend -and $backendAddress.Host -in @('127.0.0.1', 'localhost') -and $backendAddress.Port -eq 4174) {
    & (Join-Path $projectDirectory 'start.ps1') -NoBrowser
}
$development = $backendAddress.Scheme -eq 'http'
$configuration = @{ apiBase = $ApiBase.TrimEnd('/'); development = $development } | ConvertTo-Json -Compress
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
