$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$brandRoot812=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$brandAssets812=@()
foreach($mode812 in @('light','dark')){
 $srcPath812=Join-Path $brandRoot812 ('reference/brand/jingyu-line-'+$mode812+'.png')
 $src812=[Drawing.Image]::FromFile($srcPath812)
 try {
  foreach($width812 in @(640,480)){
   $out812=New-Object Drawing.Bitmap($width812,([int]($width812*$src812.Height/$src812.Width)))
   $g812=[Drawing.Graphics]::FromImage($out812);$g812.InterpolationMode='HighQualityBicubic'
   $g812.DrawImage($src812,0,0,$out812.Width,$out812.Height)
   $folder812=if($width812 -eq 640){'dist/shared/brand'}else{'miniprogram/assets/brand'}
   $relative812=$folder812+'/jingyu-'+$mode812+'.png';$dest812=Join-Path $brandRoot812 $relative812
   $out812.Save($dest812,[Drawing.Imaging.ImageFormat]::Png)
   $brandAssets812+=@{path=$relative812;width=$out812.Width;height=$out812.Height;sha256=(Get-FileHash $dest812).Hash.ToLowerInvariant()}
   $g812.Dispose();$out812.Dispose()
  }
  if($mode812 -eq 'light'){
   $fav812=New-Object Drawing.Bitmap(128,128);$fg812=[Drawing.Graphics]::FromImage($fav812);$fg812.InterpolationMode='HighQualityBicubic'
   $sourceCrop812=[Drawing.RectangleF]::new(0,0,[int]($src812.Width*.49),$src812.Height)
   $fg812.DrawImage($src812,[Drawing.RectangleF]::new(0,0,128,128),$sourceCrop812,[Drawing.GraphicsUnit]::Pixel)
   $fav812.Save((Join-Path $brandRoot812 'dist/shared/brand/jingyu-favicon.png'),[Drawing.Imaging.ImageFormat]::Png);$fg812.Dispose();$fav812.Dispose()
   $share812=New-Object Drawing.Bitmap(400,320);$sg812=[Drawing.Graphics]::FromImage($share812);$sg812.Clear([Drawing.Color]::FromArgb(245,248,250));$sg812.InterpolationMode='HighQualityBicubic'
   $sg812.DrawImage($src812,[Drawing.Rectangle]::new(8,30,384,192))
   $font812=New-Object Drawing.Font('Segoe UI',13);$brush812=New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(65,91,110))
   $sg812.DrawString('Explore. Capture. Connect.',$font812,$brush812,[Drawing.PointF]::new(90,250))
   $share812.Save((Join-Path $brandRoot812 'miniprogram/assets/brand/jingyu-share.png'),[Drawing.Imaging.ImageFormat]::Png);$font812.Dispose();$brush812.Dispose();$sg812.Dispose();$share812.Dispose()
  }
 }finally{$src812.Dispose()}
}
@{provenance='2026-10-26 user-requested fine-line edit of their original JINGYU logo. Original building, sun, orbit, bracket and custom lettering retained. Built-in imagegen edit, transparent alpha; only proportional resize for clients. Canonical outputs in reference/brand.';style='original-logo-fine-line-v812';assets=$brandAssets812} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $brandRoot812 'dist/shared/brand/jingyu-source.json') -Encoding UTF8
