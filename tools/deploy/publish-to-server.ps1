param(
    [Parameter(Mandatory=$true)][ValidatePattern('^v\d+\.\d+\.\d+$')][string]$Ref,
    [ValidatePattern('^v\d+\.\d+\.\d+(?:-[a-z][a-z0-9-]*)?$')][string]$SourceRef='',
    [string]$ConfigPath='',
    [ValidateSet('Pilot','Production')][string]$Environment='Pilot',
    [switch]$CheckOnly,
    [switch]$PrepareOnly,
    [ValidatePattern('^[A-Za-z0-9_]{3,32}$')][string]$OwnerUsername=''
)
$ErrorActionPreference='Stop'
if($CheckOnly -and $PrepareOnly){throw 'Choose CheckOnly or PrepareOnly'}
if($PrepareOnly -and $OwnerUsername){throw 'PrepareOnly does not initialize owner credentials'}
$ownerBootstrapPassword=$null
if($OwnerUsername){$ownerBootstrapPassword=[Console]::ReadLine();if(!$ownerBootstrapPassword){throw 'Provide owner password on stdin'}}
$deploymentProject=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (!$ConfigPath) { $ConfigPath=Join-Path (Split-Path $deploymentProject -Parent) 'explore-shoot-部署配置/server.json' }
$deploymentConfig=Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($deploymentConfig.server -notmatch '^\d{1,3}(\.\d{1,3}){3}$' -or $deploymentConfig.username -notmatch '^[a-z_][a-z0-9_-]*$') { throw 'Invalid server configuration' }
[void][Net.IPAddress]::Parse($deploymentConfig.server)
if ($deploymentConfig.publicOrigin -ne ('https://'+$deploymentConfig.server)) { throw 'Public HTTPS origin does not match configured server' }
foreach ($deploymentFile in $deploymentConfig.privateKey,$deploymentConfig.knownHosts) { if (!(Test-Path -LiteralPath $deploymentFile)) { throw 'Missing local SSH key or verified known_hosts' } }
$deploymentFingerprint=ssh-keygen -lf $deploymentConfig.knownHosts
if ($LASTEXITCODE -ne 0 -or $deploymentFingerprint -notmatch [regex]::Escape($deploymentConfig.hostFingerprint)) { throw 'Host fingerprint does not match verified configuration' }
$deploymentSshArgs=@('-o','ServerAliveInterval=10','-o','ServerAliveCountMax=2','-i',$deploymentConfig.privateKey,'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','ConnectTimeout=30','-o','StrictHostKeyChecking=yes','-o',('UserKnownHostsFile='+$deploymentConfig.knownHosts))
. (Join-Path $PSScriptRoot 'ssh-transport.ps1')
$deploymentSshArgs+=@(Get-ProjectSshTransportOptions -ConfigPath $ConfigPath)
$deploymentSshTarget=$deploymentConfig.username+'@'+$deploymentConfig.server
Set-Location $deploymentProject
$deploymentGitArgs=@('-c',('safe.directory='+$deploymentProject.Replace('\','/')))
if(!$SourceRef){$SourceRef=$Ref}
if($SourceRef -notmatch ('^'+[regex]::Escape($Ref)+'(?:-[a-z][a-z0-9-]*)?$')){throw 'SourceRef must belong to the requested product version'}
$deploymentFixedSource='refs/tags/'+$SourceRef
$deploymentSource=git @deploymentGitArgs rev-parse ($deploymentFixedSource+'^{commit}')
if ($LASTEXITCODE -ne 0) { throw 'Fixed release tag not found' }
git @deploymentGitArgs diff --quiet $deploymentFixedSource -- backend/src backend/pom.xml dist tools/voice-worker.py tools/voice-requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Current application source differs from requested fixed tag' }
$deploymentDirty=git @deploymentGitArgs status --porcelain -- backend/src backend/pom.xml dist
if ($deploymentDirty) { throw 'Application source has uncommitted changes' }
$expectedEnvironment=$Environment.ToLowerInvariant()
function Get-DeploymentPublicHealth {
    $healthJson=& curl.exe --noproxy '*' --connect-timeout 10 --max-time 30 --fail --silent --show-error ($deploymentConfig.publicOrigin+'/api/health')
    if($LASTEXITCODE -ne 0){throw 'Public HTTPS health check failed; certificate validation remains enabled'}
    return (($healthJson -join "`n") | ConvertFrom-Json)
}
$deploymentLive=Get-DeploymentPublicHealth
if ($deploymentLive -is [string]) { $deploymentLive=$deploymentLive | ConvertFrom-Json }
if (($deploymentLive.environment -and $deploymentLive.environment -ne $expectedEnvironment) -or (!$deploymentLive.environment -and $expectedEnvironment -ne 'pilot')) { throw 'Destination environment mismatch; no files transferred' }
if ($CheckOnly) {
    if ($deploymentLive.release -ne $Ref.Substring(1) -or $deploymentLive.backend -ne 'java') { throw 'Server version does not match requested release' }
    $deploymentReadIdentity='python3 -c ''import json; d=json.load(open("/opt/explore-shoot/current/deployment-manifest.json")); print(json.dumps({k:d[k] for k in ("sourceCommit","jarSHA256")}))'''
    $deploymentCheckManifest=ssh -n @deploymentSshArgs $deploymentSshTarget $deploymentReadIdentity
    if($LASTEXITCODE -ne 0){throw 'Could not verify fixed server source'}
    $deploymentCheckSource=(($deploymentCheckManifest -join "`n").TrimStart([char]0xFEFF) | ConvertFrom-Json)
    if($deploymentCheckSource.sourceCommit -ne $deploymentSource.Trim() -or $deploymentCheckSource.jarSHA256 -ne $deploymentLive.build){throw 'Fixed server source or build mismatch'}
    ssh -n @deploymentSshArgs $deploymentSshTarget 'systemctl is-active explore-shoot nginx; systemctl is-enabled explore-shoot explore-shoot-cert-renew.timer; readlink -f /opt/explore-shoot/current'
    if ($LASTEXITCODE -ne 0) { throw 'Server service checks failed' }
    Write-Output ('Server verified: '+$deploymentConfig.publicOrigin+' / '+$Ref)
    exit 0
}
. (Join-Path $deploymentProject 'tools/java-runtime.ps1')
$deploymentRuntime=Get-ProjectJavaRuntime
$deploymentReadIdentity='python3 -c ''import json; d=json.load(open("/opt/explore-shoot/current/deployment-manifest.json")); print(json.dumps({k:d[k] for k in ("sourceCommit","jarSHA256")}))'''
$deploymentRemoteManifest=ssh -n @deploymentSshArgs $deploymentSshTarget $deploymentReadIdentity
if ($LASTEXITCODE -ne 0) { throw 'Could not verify active immutable server release' }
$deploymentRemoteSource=(($deploymentRemoteManifest -join "`n").TrimStart([char]0xFEFF) | ConvertFrom-Json).sourceCommit
if ($deploymentRemoteSource.Trim() -eq $deploymentSource.Trim() -and $deploymentLive.build -eq $deploymentRuntime.Hash) { Write-Output ('Already deployed and healthy: '+$Ref); exit 0 }
$deploymentRun=Join-Path $deploymentProject ('tests/.runs/server-deploy-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
$deploymentStage=Join-Path $deploymentRun 'package'
New-Item -ItemType Directory -Path $deploymentStage -Force | Out-Null
$deploymentSourceZip=Join-Path $deploymentRun 'source.zip'
git @deploymentGitArgs archive --format=zip --output=$deploymentSourceZip $deploymentFixedSource
if ($LASTEXITCODE -ne 0) { throw 'Source export failed' }
Expand-Archive -LiteralPath $deploymentSourceZip -DestinationPath $deploymentStage
New-Item -ItemType Directory -Path (Join-Path $deploymentStage 'backend/target') -Force | Out-Null
Copy-Item -LiteralPath $deploymentRuntime.Jar -Destination (Join-Path $deploymentStage 'backend/target/explore-shoot-backend.jar')
$deploymentFiles=@(Get-ChildItem -LiteralPath $deploymentStage -File -Recurse -Force | ForEach-Object { @{path=$_.FullName.Substring($deploymentStage.Length+1).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()} })
if ($deploymentFiles | Where-Object { $_.path -match '^(data/|backups/|tools/bin/)|学习笔记|\.pem$|\.key$' }) { throw 'Unexpected private file in program bundle' }
@{environment=$expectedEnvironment;release=$Ref.Substring(1);sourceCommit=$deploymentSource.Trim();jarSHA256=$deploymentRuntime.Hash;files=$deploymentFiles;dataIncluded=$false;modelsIncluded=$false} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $deploymentStage 'deployment-manifest.json') -Encoding utf8
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
if($PrepareOnly){Write-Output ('Program bundle prepared without server writes: '+$deploymentArchive);exit 0}
scp @deploymentSshArgs $deploymentArchive ($deploymentSshTarget+':/opt/explore-shoot/incoming/'+$deploymentZipName)
if ($LASTEXITCODE -ne 0) { throw 'Program bundle transfer failed' }
scp @deploymentSshArgs (Join-Path $PSScriptRoot 'deploy-release.sh') ($deploymentSshTarget+':/opt/explore-shoot/incoming/deploy-release.sh')
if ($LASTEXITCODE -ne 0) { throw 'Deploy helper transfer failed' }
$deploymentCommand=('sed -i ''s/\r$//'' /opt/explore-shoot/incoming/deploy-release.sh; bash -n /opt/explore-shoot/incoming/deploy-release.sh && bash /opt/explore-shoot/incoming/deploy-release.sh /opt/explore-shoot/incoming/'+$deploymentZipName+' '+$(if($OwnerUsername){$OwnerUsername}else{"''"})+' '+$deploymentConfig.server)
if($OwnerUsername){
    if(!$ownerBootstrapPassword){throw 'Owner password must be provided on stdin; never put it in deployment arguments'}
    $ownerBootstrapPassword | ssh @deploymentSshArgs $deploymentSshTarget $deploymentCommand
    $ownerBootstrapPassword=$null
}else{ssh -n @deploymentSshArgs $deploymentSshTarget $deploymentCommand}
if ($LASTEXITCODE -ne 0) { throw 'Server update failed; check preserved backup and rollback result' }
$deploymentResult=Get-DeploymentPublicHealth
if ($deploymentResult.environment -ne $expectedEnvironment -or $deploymentResult.release -ne $Ref.Substring(1) -or $deploymentResult.build -ne $deploymentRuntime.Hash) { throw 'External server health or build mismatch' }
Write-Output ('Deployment verified: '+$deploymentConfig.publicOrigin+' / '+$Ref)
