function Get-EnvironmentProgram {
    param([string]$ProjectDirectory,[string]$EnvironmentDirectory,[string]$JarHash)
    # Candidate front-end files are frozen too: later source edits cannot change a running test build.
    $files=@(Get-Item -LiteralPath (Join-Path $ProjectDirectory 'package.json'))
    foreach($name in @('dist','reference')){
        $source=Join-Path $ProjectDirectory $name
        if(Get-ChildItem -LiteralPath $source -Recurse -Force -Attributes ReparsePoint){throw 'Candidate source cannot contain links'}
        $files+=@(Get-ChildItem -LiteralPath $source -Recurse -File -Force)
    }
    foreach($name in @('voice-worker.py','voice-requirements.txt')){
        $source=Join-Path $ProjectDirectory ('tools/'+$name)
        if(Test-Path -LiteralPath $source){$files+=Get-Item -LiteralPath $source}
    }
    $entries=@($files | ForEach-Object {
        [ordered]@{path=$_.FullName.Substring($ProjectDirectory.Length+1).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
    } | Sort-Object { $_.path })
    $summary=$JarHash+($entries | ConvertTo-Json -Compress)
    $hasher=[Security.Cryptography.SHA256]::Create()
    try{$id=[BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($summary))).Replace('-','').ToLowerInvariant()}finally{$hasher.Dispose()}
    $target=Join-Path $EnvironmentDirectory ('program-'+$id.Substring(0,16))
    $marker=Join-Path $target '.candidate.json'
    if(!(Test-Path -LiteralPath $marker)){
        foreach($entry in $entries){
            $destination=Join-Path $target $entry.path
            New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
            Copy-Item -LiteralPath (Join-Path $ProjectDirectory $entry.path) -Destination $destination
        }
        @{id=$id;jarSHA256=$JarHash;files=$entries} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $marker -Encoding utf8
    }
    $manifest=Get-Content -LiteralPath $marker -Raw -Encoding utf8 | ConvertFrom-Json
    if($manifest.id -ne $id -or $manifest.jarSHA256 -ne $JarHash){throw 'Candidate identity mismatch'}
    foreach($entry in $entries){
        if((Get-FileHash -LiteralPath (Join-Path $target $entry.path) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256){throw 'Candidate snapshot differs from checked source; no process started'}
    }
    return @{Root=$target;Id=$id}
}
