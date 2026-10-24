$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
. (Join-Path $projectRoot 'tools/deploy/ssh-transport.ps1')
& python (Join-Path $PSScriptRoot 'ssh-transport.py')
if($LASTEXITCODE -ne 0){throw 'SSH transport safety contract failed'}
$fixture=@('alpha beta','quote"value','C:\Program Files\tail\','中文路径','')
$arguments=@('-c','import json,sys;print(json.dumps(sys.argv[1:]))')+$fixture
$commandLine=($arguments | ForEach-Object {ConvertTo-ProjectProcessArgument $_}) -join ' '
$outputFile=[IO.Path]::GetTempFileName()
try {
    $process=Start-Process -FilePath (Get-Command python).Source -ArgumentList $commandLine -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $outputFile
    if($process.ExitCode -ne 0){throw 'Windows argument reflection failed'}
    $actual=@(Get-Content -LiteralPath $outputFile -Raw -Encoding UTF8 | ConvertFrom-Json)
    if(($fixture | ConvertTo-Json -Compress) -ne ($actual | ConvertTo-Json -Compress)){throw 'Windows SSH argument quoting regression'}
    Write-Output 'PASS Windows SSH paths: spaces, embedded quotes, trailing backslashes, Unicode and empty arguments'
} finally {Remove-Item -LiteralPath $outputFile}
