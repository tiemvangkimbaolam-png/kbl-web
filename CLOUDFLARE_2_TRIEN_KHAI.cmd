@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
node scripts/cloudflare.mjs check
if errorlevel 1 goto failed
node scripts/cloudflare.mjs build
if errorlevel 1 goto failed
node scripts/cloudflare.mjs deploy
if errorlevel 1 goto failed
echo Da gui len Cloudflare. Mo URL workers.dev duoc in ben tren de kiem tra.
echo Chua doi DNS hoac Worker kbl-backup cu.
pause
exit /b 0
:failed
echo Chua trien khai xong. Khong doi DNS. Doc thong bao loi ben tren.
pause
exit /b 1
