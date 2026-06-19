@echo off
setlocal
cd /d "%~dp0"

echo Stopping AssetForge dev servers (ports 3456, 5173)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1" -Quiet

echo.
pause
endlocal
