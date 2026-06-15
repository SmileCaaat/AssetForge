@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 goto no_node

where npm >nul 2>&1
if errorlevel 1 goto no_npm

if not exist "node_modules\" goto install_all
if not exist "client\node_modules\" goto install_client
goto launch

:install_all
echo [setup] First run: installing all dependencies...
call npm run setup
if errorlevel 1 goto failed
goto launch

:install_client
echo [setup] Installing client dependencies...
pushd client
call npm install
if errorlevel 1 goto failed_client
popd
goto launch

:failed_client
popd
goto failed

:launch
echo.
echo ========================================
echo   Asset Manager
echo   Frontend: http://localhost:5173
echo   API:      http://localhost:3456
echo ========================================
echo.
echo Close this window to stop the server.
echo.
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:5173"
call npm run dev
if errorlevel 1 goto failed
goto end

:no_node
echo [ERROR] Node.js not found. Install from https://nodejs.org/
goto hold

:no_npm
echo [ERROR] npm not found. Reinstall Node.js.
goto hold

:failed
echo.
echo [ERROR] Setup or start failed. See messages above.
goto hold

:end
echo.
echo Server stopped.
:hold
pause
endlocal
