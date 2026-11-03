@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0CAP_NHAT_AUTODANG.ps1"
pause
