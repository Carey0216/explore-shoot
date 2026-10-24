function Get-ProjectSshTransportOptions {
    param([Parameter(Mandatory=$true)][string]$ConfigPath)
    $transportConfiguration=Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $transportPort=if($transportConfiguration.port){[int]$transportConfiguration.port}else{22}
    if($transportPort -lt 1 -or $transportPort -gt 65535){throw 'Invalid configured SSH port'}
    $transportOptions=@('-o',('Port='+$transportPort))
    if($transportConfiguration.sshTransport.mode -eq 'auto'){
        $transportPython=(Get-Command python -ErrorAction Stop).Source
        $transportScript=Join-Path $PSScriptRoot 'ssh-transport.py'
        $transportConfig=(Resolve-Path -LiteralPath $ConfigPath).Path
        foreach($transportPath in $transportPython,$transportScript,$transportConfig){if($transportPath -match '["%\r\n]'){throw 'Unsafe SSH transport path'}}
        $transportCommand='"'+$transportPython+'" -u "'+$transportScript+'" --config "'+$transportConfig+'" %h %p'
        $transportOptions+=@('-o',('ProxyCommand='+$transportCommand))
    }
    return $transportOptions
}

function ConvertTo-ProjectProcessArgument {
    param([AllowEmptyString()][string]$Argument)
    # Windows CommandLineToArgvW quoting: escape quotes and their preceding
    # backslashes, then double trailing backslashes before the closing quote.
    if($Argument.Length -gt 0 -and $Argument -notmatch '[\s"]'){return $Argument}
    $escaped=[regex]::Replace($Argument,'(\\*)"',{param($match) ('\' * ($match.Groups[1].Length*2+1))+'"'})
    $escaped=[regex]::Replace($escaped,'(\\+)$',{param($match) '\' * ($match.Length*2)})
    return '"'+$escaped+'"'
}
