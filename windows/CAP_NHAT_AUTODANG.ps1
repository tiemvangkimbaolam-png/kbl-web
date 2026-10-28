$ErrorActionPreference='Stop'
$root=$PSScriptRoot
if(-not(Test-Path -LiteralPath (Join-Path $root 'kbl-config.json'))){throw 'Extract this patch directly into the existing KBL_WINDOWS_MOI folder containing kbl-config.json.'}
$targets=@((Join-Path $root 'launcher.cjs'),(Join-Path $root 'KBL_WINDOWS.cjs'))
Get-CimInstance Win32_Process | Where-Object {$_.Name -eq 'node.exe' -and $_.CommandLine} | ForEach-Object {$p=$_;foreach($target in $targets){if($p.CommandLine.IndexOf($target,[StringComparison]::OrdinalIgnoreCase) -ge 0){Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue;break}}}
Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c',('"'+(Join-Path $root 'CHAY_NEN.cmd')+'"')) -WorkingDirectory $root
Write-Host 'Worker restarted. Config, POS data, Chrome profiles and cookies were not changed.'
