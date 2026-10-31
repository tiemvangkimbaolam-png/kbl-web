$ErrorActionPreference='Stop'
$root=$PSScriptRoot
if(-not(Test-Path -LiteralPath (Join-Path $root 'kbl-config.json'))){throw 'Extract this patch directly into the existing KBL_WINDOWS_MOI folder containing kbl-config.json.'}
$targets=@((Join-Path $root 'launcher.cjs'),(Join-Path $root 'KBL_WINDOWS.cjs'))
$processes=@(Get-CimInstance Win32_Process | Where-Object {$_.Name -eq 'node.exe' -and $_.CommandLine})
foreach($target in $targets){foreach($p in $processes){if($p.CommandLine.IndexOf($target,[StringComparison]::OrdinalIgnoreCase) -ge 0){Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue}}}
Start-Sleep -Milliseconds 700
function Read-WorkerHealth {try {return Invoke-RestMethod -Uri 'http://127.0.0.1:39878/integration/health' -TimeoutSec 2} catch {return $null}}
$old=Read-WorkerHealth
if($old){throw 'The old local worker is still running. If BAT_DAU.cmd is open, press Ctrl+C in that window and run this update again. No unrelated process was stopped.'}
Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c',('"'+(Join-Path $root 'CHAY_NEN.cmd')+'"')) -WorkingDirectory $root
$ready=$false
for($attempt=0;$attempt -lt 12;$attempt++){Start-Sleep -Milliseconds 750;$health=Read-WorkerHealth;if($health.protocol -eq 'kbl-chrome-bridge-v1' -and $health.release -eq '2.2.0'){$ready=$true;break}}
if(-not $ready){throw 'Worker 2.2.0 has not confirmed startup. Open BAT_DAU.cmd to see the error; do not reconnect or replace your config.'}
Write-Host 'Local worker 2.2.0 confirmed. Config, POS data, Chrome profiles and cookies were not changed. Provider publishing is not verified by this startup check.'
