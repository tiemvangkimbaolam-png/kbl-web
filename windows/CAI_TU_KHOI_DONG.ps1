param([ValidateSet('enable','disable')][string]$Mode='enable')
$ErrorActionPreference='Stop'
$startup=[Environment]::GetFolderPath('Startup')
$linkPath=Join-Path $startup 'KBL-Windows-Moi.lnk'
if($Mode -eq 'disable') {
  if(Test-Path -LiteralPath $linkPath){Remove-Item -LiteralPath $linkPath}
  Write-Host 'Đã bỏ tự khởi động KBL. Không xóa dữ liệu, không tắt Chrome hoặc tác vụ đang chạy.'
  exit 0
}
if(!(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'kbl-config.json'))){throw 'Thiếu kbl-config.json. Tải cấu hình từ Admin mới trước.'}
$node=(Get-Command node.exe -ErrorAction Stop).Source
$major=& $node -p "process.versions.node.split('.')[0]"
if([int]$major -lt 24){throw 'Cần Node.js 24.'}
$shell=New-Object -ComObject WScript.Shell
$link=$shell.CreateShortcut($linkPath)
$link.TargetPath=(Join-Path $env:WINDIR 'System32\wscript.exe')
$link.Arguments='"'+(Join-Path $PSScriptRoot 'CHAY_AN.vbs')+'"'
$link.WorkingDirectory=$PSScriptRoot
$link.Description='KBL Windows mới — chỉ tài khoản Windows hiện tại'
$link.Save()
Write-Host 'Đã bật tự chạy khi đăng nhập Windows. Chạy BO_TU_KHOI_DONG.cmd để bỏ.'
