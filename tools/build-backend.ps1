param([switch]$SkipTests)
$ErrorActionPreference='Stop'
$projectDirectory=Split-Path -Parent $PSScriptRoot
$javaCommand=Get-Command java -ErrorAction Stop
$mavenCommand=Get-Command mvn -ErrorAction SilentlyContinue
if($mavenCommand){$mavenPath=$mavenCommand.Source}else{
  $version='3.9.16'
  $toolDirectory=Join-Path $PSScriptRoot 'bin'
  $mavenPath=Join-Path $toolDirectory "apache-maven-$version/bin/mvn.cmd"
  if(-not(Test-Path -LiteralPath $mavenPath)){
    New-Item -ItemType Directory -Path $toolDirectory -Force | Out-Null
    $archive=Join-Path $toolDirectory "apache-maven-$version-bin.zip"
    $download="https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/$version/apache-maven-$version-bin.zip"
    Invoke-WebRequest $download -OutFile $archive -UseBasicParsing
    $expected=(Invoke-WebRequest ($download+'.sha512') -UseBasicParsing).Content.Trim().Split(' ')[0]
    $hasher=[System.Security.Cryptography.SHA512]::Create()
    try { $archiveHash=[BitConverter]::ToString($hasher.ComputeHash([System.IO.File]::ReadAllBytes($archive))).Replace('-','').ToLower() } finally { $hasher.Dispose() }
    if($archiveHash -ne $expected.ToLower()){throw 'Maven checksum mismatch.'}
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($archive,$toolDirectory)
  }
}
$arguments=@('-f',(Join-Path $projectDirectory 'backend/pom.xml'),'--batch-mode','-Dfile.encoding=UTF-8','package')
if($SkipTests){$arguments+='-DskipTests'}
& $mavenPath @arguments
if($LASTEXITCODE -ne 0){throw 'Java build or tests failed. The running service was not changed.'}
Write-Output 'Java backend is ready: backend/target/explore-shoot-backend.jar'
