param([string]$PythonPath='')
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot\..
$runtimeDir=Join-Path (Get-Location) 'tools\bin'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
if(!$PythonPath){
 $bundledPython=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
 if(Test-Path -LiteralPath $bundledPython){$PythonPath=$bundledPython}else{$PythonPath=(Get-Command python -ErrorAction Stop).Source}
}
$voicePython=Join-Path $runtimeDir 'voice-env\Scripts\python.exe'
if(!(Test-Path -LiteralPath $voicePython)){& $PythonPath -m venv (Join-Path $runtimeDir 'voice-env');if($LASTEXITCODE){throw '请安装 Python 3.12 或使用 -PythonPath 指定可用解释器'}}
& $voicePython -m pip install -r (Join-Path $PSScriptRoot 'voice-requirements.txt')
if($LASTEXITCODE){throw '语音依赖安装失败，请检查网络'}
$archive=Join-Path $runtimeDir 'kokoro-int8-multi-lang-v1_1.tar.bz2'
$expectedHash='A1E94694776049035C4F2C6529F003AAECE993C76AAE9A78995831C3C4DCAFC6'
if(!(Test-Path -LiteralPath $archive)){
 Write-Host '正在下载官方免费中文音色模型（约 140 MB）…'
 curl.exe --fail --location --retry 2 --output $archive 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-multi-lang-v1_1.tar.bz2'
 if($LASTEXITCODE){throw '音色下载失败，请重试'}
}
if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expectedHash){throw '模型校验失败，请移除损坏的下载包后重试；未加载文件'}
tar -xf $archive -C $runtimeDir
if($LASTEXITCODE){throw '模型解压失败'}
Write-Host '免费本机音色已安装。启动项目后，在步行导航 → 选择导航声音里试听。'
