param(
    [ValidateSet('Development','Test')][string]$Environment='Development',
    [switch]$Stop,
    [string]$ResetConfirmation,
    [switch]$NoBrowser
)
$ErrorActionPreference='Stop'
$projectDirectory=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDirectory
. (Join-Path $PSScriptRoot 'java-runtime.ps1')
$runtime=Get-ProjectJavaRuntime
$name=$Environment.ToLowerInvariant()
$folder=Join-Path $projectDirectory ('.environments/'+$name)
$data=Join-Path $folder 'data'
$pidFile=Join-Path $folder 'server.pid'
$port=if($name -eq 'test'){4354}else{4344}
$adminPort=$port+2
function Stop-OwnedEnvironment {
    if (Test-Path -LiteralPath $pidFile) {
        $ownedId=[int](Get-Content -LiteralPath $pidFile -Raw)
        $expectedIdentity=(Get-Content -LiteralPath (Join-Path $data '.environment.json') -Raw | ConvertFrom-Json).instanceId
        $owned=Get-CimInstance Win32_Process -Filter ('ProcessId='+$ownedId)
        if ($owned -and ($owned.Name -notmatch '^java(w)?\.exe$' -or !$owned.CommandLine.Contains(('-Dexplore.environment.id='+$expectedIdentity)))) { throw 'PID does not belong to this environment; no process stopped' }
        if ($owned) { Stop-Process -Id $ownedId -ErrorAction Stop }
    }
}
if ($Stop -or $ResetConfirmation) {
    if ($ResetConfirmation) {
        $expectedIdentity=(Get-Content -LiteralPath (Join-Path $data '.environment.json') -Raw | ConvertFrom-Json).instanceId
        if ($ResetConfirmation -ne $expectedIdentity) { throw 'Reset identity mismatch; no process stopped' }
    }
    Stop-OwnedEnvironment
    if ($ResetConfirmation) {
        & $runtime.Java -jar $runtime.Jar --tool=environment ('--name='+$name) --reset ('--confirm='+$ResetConfirmation)
        if ($LASTEXITCODE -ne 0) { throw 'Reset refused; data preserved' }
    }
    return
}
$identityRaw=& $runtime.Java -jar $runtime.Jar --tool=environment ('--name='+$name)
if ($LASTEXITCODE -ne 0) { throw 'Environment initialization failed' }
$identity=$identityRaw | ConvertFrom-Json
$programRoot=$projectDirectory
$programId=$runtime.Hash
if($name -eq 'test'){
    . (Join-Path $PSScriptRoot 'environment-snapshot.ps1')
    $snapshot=Get-EnvironmentProgram -ProjectDirectory $projectDirectory -EnvironmentDirectory $folder -JarHash $runtime.Hash
    $programRoot=$snapshot.Root
    $programId=$snapshot.Id
}

try {
    $current=Invoke-RestMethod ('http://127.0.0.1:'+$port+'/api/runtime') -TimeoutSec 2
    if ($current.instanceId -ne $identity.instanceId) { throw 'Port belongs to another environment' }
    $health=Invoke-RestMethod ('http://127.0.0.1:'+$port+'/api/health') -TimeoutSec 2
    $owned=if(Test-Path -LiteralPath $pidFile){Get-CimInstance Win32_Process -Filter ('ProcessId='+[int](Get-Content -LiteralPath $pidFile -Raw))}
    if ($health.build -eq $runtime.Hash -and $owned -and $owned.CommandLine.Contains(('-Dexplore.program.id='+$programId))) { Write-Output ('Already running '+$name+' at port '+$port); return }
    if (!(Test-Path -LiteralPath $pidFile)) { throw 'Running environment has no owned PID; stop it manually' }
    Stop-OwnedEnvironment
} catch {
    if ($_.Exception.Message -match 'Port belongs|no owned PID|does not belong') { throw }
}
$values=@{EXPLORE_ENV=$name;EXPLORE_PROJECT_ROOT=$programRoot;EXPLORE_DATA_DIR=$data;PORT=[string]$port;ADMIN_PORT=[string]$adminPort;EXPLORE_VOICE_WARMUP='0';WECHAT_LOGIN_MODE='off';WECHAT_APP_ID='';WECHAT_APP_SECRET='';EXPLORE_TEST_MODE='';EXPLORE_TEST_CLOCK='';ADMIN_PASSWORD='LocalSandbox2026!'}
$previous=@{}
try {
    foreach($key in $values.Keys){$previous[$key]=[Environment]::GetEnvironmentVariable($key,'Process');[Environment]::SetEnvironmentVariable($key,$values[$key],'Process')}
    $process=Start-Process -FilePath $runtime.Java -ArgumentList '-Dfile.encoding=UTF-8',('-Dexplore.build.hash='+$runtime.Hash),('-Dexplore.environment.id='+$identity.instanceId),('-Dexplore.program.id='+$programId),'-jar',('"'+$runtime.Jar+'"') -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $folder 'server.log') -RedirectStandardError (Join-Path $folder 'server-error.log') -PassThru
    Set-Content -LiteralPath $pidFile -Value $process.Id
} finally {foreach($key in $previous.Keys){[Environment]::SetEnvironmentVariable($key,$previous[$key],'Process')}}
for($attempt=0;$attempt -lt 45;$attempt++){
    Start-Sleep -Milliseconds 500
    try{
        $ready=Invoke-RestMethod ('http://127.0.0.1:'+$port+'/api/runtime') -TimeoutSec 1
        if($ready.name -eq $name -and $ready.instanceId -eq $identity.instanceId){
            Write-Output ($name+' / User http://127.0.0.1:'+$port+' / Admin http://127.0.0.1:'+$adminPort)
            Write-Output 'Local sandbox only: initial admin is admin / LocalSandbox2026!; existing passwords are retained.'
            Write-Output ('Reset requires stopping this environment and passing -ResetConfirmation '+$identity.instanceId)
            if(!$NoBrowser){Start-Process ('http://127.0.0.1:'+$port)}
            return
        }
    }catch{}
}
throw 'Environment failed to start; inspect its isolated server-error.log'
