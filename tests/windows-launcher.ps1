# Run explicitly with Windows PowerShell 5.1 as well as PowerShell 7.
$ErrorActionPreference='Stop'
$projectDirectory=Split-Path $PSScriptRoot -Parent
$package=Get-Content -LiteralPath (Join-Path $projectDirectory 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if(!$package.version -or !$package.description.Contains('北方民族大学')){throw 'UTF-8 package metadata did not round-trip'}
$scripts=@('start.ps1','phone-test.ps1','https-test.ps1','stop-https-test.ps1','tools/setup-voice.ps1','tools/start-environment.ps1','tools/assistant-config.ps1','tools/wechat-config.ps1')
foreach($script in $scripts){
 $tokens=$null;$problems=$null
 [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $projectDirectory $script),[ref]$tokens,[ref]$problems)
 if($problems){throw ('Windows PowerShell cannot parse '+$script)}
}
$temporary=Join-Path ([IO.Path]::GetTempPath()) ('explore-启动检查-'+[guid]::NewGuid().ToString())
$fakeProject=Join-Path $temporary '项目源码'
$configurationDirectory=Join-Path $temporary 'explore-shoot-部署配置'
New-Item -ItemType Directory -Path $fakeProject,$configurationDirectory | Out-Null
Add-Type -AssemblyName System.Security
$bytes=[Text.Encoding]::UTF8.GetBytes('LOCAL_FIXTURE_KEY_ONLY')
$encrypted=[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))
$model='本机测试模型'
$fake=@{protectionFormat='dpapi-v1';apiBase='http://127.0.0.1:8000/v1';model=$model;protectedSecret=$encrypted}
[IO.File]::WriteAllText((Join-Path $configurationDirectory 'assistant.local.json'),($fake|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
$fake=@{protectionFormat='dpapi-v1';appId='wx0000000000000000';loginMode='test';protectedSecret=$encrypted}
[IO.File]::WriteAllText((Join-Path $configurationDirectory 'wechat.local.json'),($fake|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
. (Join-Path $projectDirectory 'tools/assistant-config.ps1')
. (Join-Path $projectDirectory 'tools/wechat-config.ps1')
$assistant=Get-ProjectAssistantEnvironment -ProjectDirectory $fakeProject
$wechat=Get-ProjectWechatEnvironment -ProjectDirectory $fakeProject
if($assistant.ASSISTANT_MODEL -ne $model -or $assistant.ASSISTANT_API_KEY -ne 'LOCAL_FIXTURE_KEY_ONLY' -or $wechat.WECHAT_APP_SECRET -ne 'LOCAL_FIXTURE_KEY_ONLY'){throw 'Configuration in Unicode paths failed to round-trip'}
$assistant.Clear();$wechat.Clear();[Array]::Clear($bytes,0,$bytes.Length)
# Remove only exact files created by this test, never recursively delete a computed path.
Remove-Item -LiteralPath (Join-Path $configurationDirectory 'assistant.local.json'),(Join-Path $configurationDirectory 'wechat.local.json')
Remove-Item -LiteralPath $configurationDirectory,$fakeProject,$temporary
Write-Output ('PASS PowerShell '+$PSVersionTable.PSVersion+': UTF-8 metadata, script parsing and encrypted configuration in Unicode paths')
