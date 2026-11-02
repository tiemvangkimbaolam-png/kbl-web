@echo off
cd /d "%~dp0"
node setup.cjs check
if errorlevel 1 goto fail
start "" wscript.exe "%~dp0CHAY_AN.vbs"
exit /b
:fail
pause
