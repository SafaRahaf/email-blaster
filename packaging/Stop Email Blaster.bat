@echo off
setlocal
title Stop Email Blaster

rem Stops the hidden Email Blaster server (the process listening on port 3100).

set "FOUND="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":3100 .*LISTENING"') do (
  set "FOUND=1"
  taskkill /PID %%p /F >nul 2>&1
)

if defined FOUND (
  echo Email Blaster has been stopped.
) else (
  echo Email Blaster was not running.
)

timeout /t 2 >nul
