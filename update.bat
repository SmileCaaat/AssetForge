@echo off
setlocal
cd /d "%~dp0"

where git >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Git not found. Install from https://git-scm.com/download/win
  goto hold
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1" %*
set EXITCODE=%ERRORLEVEL%

if %EXITCODE% neq 0 goto failed
goto end

:failed
echo.
echo [ERROR] Update failed. See messages above.
goto hold

:end
echo.
goto hold

:hold
pause
endlocal
exit /b %EXITCODE%
