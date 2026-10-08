param([string]$PythonPath='')
$ErrorActionPreference='Stop'
$project427=Split-Path $PSScriptRoot -Parent
$runtime427=Join-Path $project427 'tools\bin\translation'
New-Item -ItemType Directory -Path $runtime427 -Force | Out-Null
if(!$PythonPath){$PythonPath=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe';if(!(Test-Path -LiteralPath $PythonPath)){$PythonPath=(Get-Command python -ErrorAction Stop).Source}}
$python427=Join-Path $runtime427 'env\Scripts\python.exe'
if(!(Test-Path -LiteralPath $python427)){& $PythonPath -m venv (Join-Path $runtime427 'env');if($LASTEXITCODE){throw '翻译环境创建失败'}}
& $python427 -m pip install 'ctranslate2==4.6.0' 'sentencepiece==0.2.1' 'opencc-python-reimplemented==0.1.7' 'setuptools==80.9.0'
if($LASTEXITCODE){throw '翻译依赖安装失败'}
$models427=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'translation-models.json') -Raw | ConvertFrom-Json
foreach($entry427 in $models427){
 $model427=$entry427.name
 $archive427=Join-Path $runtime427 ($model427+'.argosmodel')
 $folder427=Join-Path $runtime427 $model427
 if(!(Test-Path -LiteralPath $archive427)){$download427=$archive427+'.download';curl.exe --fail --location --retry 2 --output $download427 $entry427.url;if($LASTEXITCODE){throw '官方翻译模型下载失败，可重新运行安装脚本'};Move-Item -LiteralPath $download427 -Destination $archive427 -Force}
 if((Get-FileHash -LiteralPath $archive427 -Algorithm SHA256).Hash -ne $entry427.sha256){throw ('翻译模型校验失败，请移走此文件后重新下载：'+$archive427)}
 & $python427 -c 'import sys,zipfile,pathlib; z=zipfile.ZipFile(sys.argv[1]); root=pathlib.Path(sys.argv[2]).resolve(); assert all((root / n).resolve().is_relative_to(root) for n in z.namelist()); z.extractall(root)' $archive427 $folder427
 if($LASTEXITCODE){throw '翻译模型解压失败'}
}
Write-Output '本机离线翻译已安装。模型在 tools/bin/translation，不提交 GitHub。'

