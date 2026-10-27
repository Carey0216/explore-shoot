param()
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -Path (Join-Path $PSScriptRoot 'JingyuLineRenderer.cs')
$lineRoot812=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$geometry812=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'jingyu-line-geometry.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach($entry812 in $geometry812.PSObject.Properties){foreach($dark812 in @($false,$true)){
 $suffix812=if($dark812){'-dark'}else{''};$ink812=if($dark812){'#bad3e0'}else{'#496a7b'}
 foreach($size812 in @(48,96)){
 $bmp812=[JingyuLines812]::Canvas($size812,$size812);$g812=[JingyuLines812]::G($bmp812,$size812/32.0);$pen812=[JingyuLines812]::Pen([Drawing.ColorTranslator]::FromHtml($ink812),1.7)
 try{foreach($shape812 in $entry812.Value){[JingyuLines812]::Shape($g812,$pen812,$shape812.t,[float[]]$shape812.p)}
 $out812=if($size812 -eq 48){'miniprogram/assets/jingyu-icons'}else{'dist/shared/jingyu-icons'}
 $bmp812.Save((Join-Path $lineRoot812 ($out812+'/'+$entry812.Name+$suffix812+'.png')),[Drawing.Imaging.ImageFormat]::Png)
 }finally{$pen812.Dispose();$g812.Dispose();$bmp812.Dispose()}
 }
}}
