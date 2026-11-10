@echo off
setlocal
title Email Blaster (visible window - for troubleshooting)
rem Always run from the folder this file lives in.
cd /d "%~dp0"

rem Bind to loopback only: no other PC on the network can reach the app.
set "PORT=3100"
set "HOSTNAME=127.0.0.1"
set "NODE_ENV=production"

rem Already running? Just open the app instead of starting a second copy.
netstat -ano | findstr /R /C:":3100 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
start "" "http://127.0.0.1:3100"
  exit /b 0
)

if not exist "node.exe" (
  echo.
  echo ERROR: node.exe is missing from this folder.
  echo Reinstall the package and keep all files together.
  echo.
  pause
  exit /b 1
)

if not exist "server.js" (
  echo.
  echo ERROR: server.js is missing from this folder.
  echo Reinstall the package and keep all files together.
  echo.
  pause
  exit /b 1
)

echo.
echo   Email Blaster is starting...
echo   The browser opens at http://127.0.0.1:3100
echo.
echo   KEEP THIS WINDOW OPEN while the app is running.
echo   Close this window (or press Ctrl+C) to stop the app.
echo.

start "" "http://127.0.0.1:3100"
node.exe server.js

echo.
echo Email Blaster has stopped.
pause

