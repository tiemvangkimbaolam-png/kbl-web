@echo off
chcp 65001 >nul
cd /d "%~dp0"
node setup.cjs open
if errorlevel 1 pause
