@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Can cai Node.js 24 truoc. Khong upload thu muc Windows len hosting.
 pause
 exit /b 1
)
echo Cai cong cu build tren may Windows, khong chep len Tenten...
call npx --yes pnpm@11.25.0 install --frozen-lockfile
if errorlevel 1 goto failed
node scripts/cloudflare.mjs login
if errorlevel 1 goto failed
echo Da dang nhap. Doc HUONG_DAN_CLOUDFLARE.md de tao D1, R2 va Access.
pause
exit /b 0
:failed
echo Chua hoan tat. Giu nguyen thong bao loi ben tren de kiem tra.
pause
exit /b 1
