param([string]$PythonPath='')
$ErrorActionPreference='Stop'
$localeProject=Split-Path $PSScriptRoot -Parent
$localeRuntime=Join-Path $PSScriptRoot 'bin/localization'
New-Item -ItemType Directory -Path $localeRuntime -Force | Out-Null
if(!$PythonPath){$PythonPath=Join-Path $PSScriptRoot 'bin/voice-env/Scripts/python.exe';if(!(Test-Path -LiteralPath $PythonPath)){$PythonPath=(Get-Command python).Source}}
$localePython=Join-Path $localeRuntime 'env/Scripts/python.exe'
if(!(Test-Path -LiteralPath $localePython)){& $PythonPath -m venv (Join-Path $localeRuntime 'env');if($LASTEXITCODE){throw '双语环境创建失败'}}
& $localePython -m pip install --disable-pip-version-check 'ctranslate2==4.6.0' 'sentencepiece==0.2.1' 'setuptools==80.9.0'
if($LASTEXITCODE){throw '双语推理依赖安装失败'}
foreach($localeModel in (Get-Content (Join-Path $PSScriptRoot 'localization-models.json') -Raw|ConvertFrom-Json)) {
 $localeArchive=Join-Path $localeRuntime ($localeModel.name+'.argosmodel')
 $localeFolder=Join-Path $localeRuntime $localeModel.name
 if(!(Test-Path -LiteralPath $localeArchive)){curl.exe --fail --location --retry 2 --max-time 180 --output ($localeArchive+'.download') $localeModel.url;if($LASTEXITCODE){throw '官方模型下载失败'};Move-Item -LiteralPath ($localeArchive+'.download') -Destination $localeArchive}
 if((Get-FileHash -LiteralPath $localeArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $localeModel.sha256){throw '双语模型SHA256校验失败'}
 if(!(Test-Path -LiteralPath $localeFolder)) { & $localePython -c 'import sys,zipfile,pathlib; z=zipfile.ZipFile(sys.argv[1]); root=pathlib.Path(sys.argv[2]).resolve(); assert all((root/n).resolve().is_relative_to(root) for n in z.namelist()); z.extractall(root)' $localeArchive $localeFolder; if($LASTEXITCODE){throw '模型解包失败'} }
}
Write-Output '中文/English 本机推理已就绪；用户文字不发往外部翻译服务。'
