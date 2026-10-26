$ErrorActionPreference='Stop'
$taskFolder=$PSScriptRoot
$startup=[Environment]::GetFolderPath('Startup')
$shell=New-Object -ComObject WScript.Shell
$link=$shell.CreateShortcut((Join-Path $startup 'KBL-Windows-Moi.lnk'))
$link.TargetPath=(Join-Path $env:WINDIR 'System32\wscript.exe')
$link.Arguments='"'+(Join-Path $taskFolder 'CHAY_AN.vbs')+'"'
$link.WorkingDirectory=$taskFolder
$link.Description='KBL Windows mới — chỉ tài khoản Windows hiện tại'
$link.Save()
Write-Host 'Đã thêm tự chạy khi đăng nhập Windows. Muốn bỏ: Win+R → shell:startup → xóa KBL-Windows-Moi.'
