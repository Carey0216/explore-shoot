param(
    [Parameter(Mandatory=$true)][ValidatePattern('^v\d+\.\d+\.\d+$')][string]$Ref,
    [string]$ConfigPath='',
    [switch]$CheckOnly
)
$ErrorActionPreference='Stop'
$deploymentProject=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (!$ConfigPath) { $ConfigPath=Join-Path (Split-Path $deploymentProject -Parent) 'explore-shoot-部署配置/server.json' }
$deploymentConfig=Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($deploymentConfig.server -notmatch '^\d{1,3}(\.\d{1,3}){3}$' -or $deploymentConfig.username -notmatch '^[a-z_][a-z0-9_-]*$') { throw 'Invalid server configuration' }
[void][Net.IPAddress]::Parse($deploymentConfig.server)
if ($deploymentConfig.publicOrigin -ne ('https://'+$deploymentConfig.server)) { throw 'Public HTTPS origin does not match configured server' }
foreach ($deploymentFile in $deploymentConfig.privateKey,$deploymentConfig.knownHosts) { if (!(Test-Path -LiteralPath $deploymentFile)) { throw 'Missing local SSH key or verified known_hosts' } }
$deploymentFingerprint=ssh-keygen -lf $deploymentConfig.knownHosts
if ($LASTEXITCODE -ne 0 -or $deploymentFingerprint -notmatch [regex]::Escape($deploymentConfig.hostFingerprint)) { throw 'Host fingerprint does not match verified configuration' }
$deploymentSshArgs=@('-o','KexAlgorithms=curve25519-sha256','-i',$deploymentConfig.privateKey,'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=yes','-o',('UserKnownHostsFile='+$deploymentConfig.knownHosts))
$deploymentSshTarget=$deploymentConfig.username+'@'+$deploymentConfig.server
Set-Location $deploymentProject
$deploymentGitArgs=@('-c',('safe.directory='+$deploymentProject.Replace('\','/')))
$deploymentSource=git @deploymentGitArgs rev-parse ($Ref+'^{commit}')
if ($LASTEXITCODE -ne 0) { throw 'Fixed release tag not found' }
git @deploymentGitArgs diff --quiet $Ref -- backend/src backend/pom.xml dist tools/voice-worker.py tools/voice-requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Current application source differs from requested fixed tag' }
$deploymentDirty=git @deploymentGitArgs status --porcelain -- backend/src backend/pom.xml dist
if ($deploymentDirty) { throw 'Application source has uncommitted changes' }
$deploymentLive=Invoke-RestMethod -Uri ($deploymentConfig.publicOrigin+'/api/health') -TimeoutSec 30
if ($CheckOnly) {
    if ($deploymentLive.release -ne $Ref.Substring(1) -or $deploymentLive.backend -ne 'java') { throw 'Server version does not match requested release' }
    ssh @deploymentSshArgs $deploymentSshTarget 'systemctl is-active explore-shoot nginx; systemctl is-enabled explore-shoot explore-shoot-cert-renew.timer; readlink -f /opt/explore-shoot/current'
    if ($LASTEXITCODE -ne 0) { throw 'Server service checks failed' }
    Write-Output ('Server verified: '+$deploymentConfig.publicOrigin+' / '+$Ref)
    exit 0
}
. (Join-Path $deploymentProject 'tools/java-runtime.ps1')
$deploymentRuntime=Get-ProjectJavaRuntime
$deploymentRemoteManifest=ssh @deploymentSshArgs $deploymentSshTarget 'cat /opt/explore-shoot/current/deployment-manifest.json'
if ($LASTEXITCODE -ne 0) { throw 'Could not verify active immutable server release' }
$deploymentRemoteSource=(($deploymentRemoteManifest -join "`n").TrimStart([char]0xFEFF) | ConvertFrom-Json).sourceCommit
if ($deploymentRemoteSource.Trim() -eq $deploymentSource.Trim() -and $deploymentLive.build -eq $deploymentRuntime.Hash) { Write-Output ('Already deployed and healthy: '+$Ref); exit 0 }
$deploymentRun=Join-Path $deploymentProject ('tests/.runs/server-deploy-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
$deploymentStage=Join-Path $deploymentRun 'package'
New-Item -ItemType Directory -Path $deploymentStage -Force | Out-Null
$deploymentSourceZip=Join-Path $deploymentRun 'source.zip'
git @deploymentGitArgs archive --format=zip --output=$deploymentSourceZip $Ref
if ($LASTEXITCODE -ne 0) { throw 'Source export failed' }
Expand-Archive -LiteralPath $deploymentSourceZip -DestinationPath $deploymentStage
New-Item -ItemType Directory -Path (Join-Path $deploymentStage 'backend/target') -Force | Out-Null
Copy-Item -LiteralPath $deploymentRuntime.Jar -Destination (Join-Path $deploymentStage 'backend/target/explore-shoot-backend.jar')
$deploymentFiles=@(Get-ChildItem -LiteralPath $deploymentStage -File -Recurse -Force | ForEach-Object { @{path=$_.FullName.Substring($deploymentStage.Length+1).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()} })
if ($deploymentFiles | Where-Object { $_.path -match '^(data/|backups/|tools/bin/)|学习笔记|\.pem$|\.key$' }) { throw 'Unexpected private file in program bundle' }
@{release=$Ref.Substring(1);sourceCommit=$deploymentSource.Trim();jarSHA256=$deploymentRuntime.Hash;files=$deploymentFiles;dataIncluded=$false;modelsIncluded=$false} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $deploymentStage 'deployment-manifest.json') -Encoding utf8
$deploymentZipName='explore-shoot-'+$Ref+'.zip'
$deploymentArchive=Join-Path $deploymentRun $deploymentZipName
# Windows PowerShell 5 / .NET Framework uses backslashes in CreateFromDirectory.
# Linux needs portable ZIP entry names matching the checked manifest.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$deploymentStream=[IO.File]::Open($deploymentArchive,[IO.FileMode]::CreateNew)
$deploymentZipArchive=New-Object IO.Compression.ZipArchive -ArgumentList $deploymentStream,([IO.Compression.ZipArchiveMode]::Create),$false
try {
    foreach ($deploymentEntry in $deploymentFiles) {
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($deploymentZipArchive,(Join-Path $deploymentStage $deploymentEntry.path),$deploymentEntry.path,[IO.Compression.CompressionLevel]::Optimal)
    }
    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($deploymentZipArchive,(Join-Path $deploymentStage 'deployment-manifest.json'),'deployment-manifest.json',[IO.Compression.CompressionLevel]::Optimal)
} finally { $deploymentZipArchive.Dispose(); $deploymentStream.Dispose() }
scp @deploymentSshArgs $deploymentArchive ($deploymentSshTarget+':/opt/explore-shoot/incoming/'+$deploymentZipName)
if ($LASTEXITCODE -ne 0) { throw 'Program bundle transfer failed' }
scp @deploymentSshArgs (Join-Path $PSScriptRoot 'deploy-release.sh') ($deploymentSshTarget+':/opt/explore-shoot/incoming/deploy-release.sh')
if ($LASTEXITCODE -ne 0) { throw 'Deploy helper transfer failed' }
ssh @deploymentSshArgs $deploymentSshTarget ('sed -i ''s/\r$//'' /opt/explore-shoot/incoming/deploy-release.sh; bash -n /opt/explore-shoot/incoming/deploy-release.sh && bash /opt/explore-shoot/incoming/deploy-release.sh /opt/explore-shoot/incoming/'+$deploymentZipName)
if ($LASTEXITCODE -ne 0) { throw 'Server update failed; check preserved backup and rollback result' }
$deploymentResult=Invoke-RestMethod -Uri ($deploymentConfig.publicOrigin+'/api/health') -TimeoutSec 30
if ($deploymentResult.release -ne $Ref.Substring(1) -or $deploymentResult.build -ne $deploymentRuntime.Hash) { throw 'External server health or build mismatch' }
Write-Output ('Deployment verified: '+$deploymentConfig.publicOrigin+' / '+$Ref)
