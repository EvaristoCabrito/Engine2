@echo off
setlocal
cd /d "%~dp0"

set "ENGINE2_URL=http://localhost:8080/"

rem Check listening sockets directly; a connection probe misses IPv6-only listeners.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$listener = Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue | Select-Object -First 1; if ($listener) { exit 0 } else { exit 1 }"
if not errorlevel 1 (
  echo A local server is already using port 8080. Opening %ENGINE2_URL%
  echo If the browser does not open, copy this address into it: %ENGINE2_URL%
  start "" "%ENGINE2_URL%"
  echo.
  echo This launcher cannot start a second server while port 8080 is occupied.
  pause
  exit /b 0
)

echo Starting Engine2 Vite at %ENGINE2_URL%
call npm run dev
if errorlevel 1 (
  echo.
  rem Handle a server that grabbed port 8080 after the preflight check.
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$listener = Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue | Select-Object -First 1; if ($listener) { exit 0 } else { exit 1 }"
  if not errorlevel 1 (
    echo Port 8080 became occupied. Opening %ENGINE2_URL%
    echo If this is not Engine2, close the program using port 8080 and run start.bat again.
    start "" "%ENGINE2_URL%"
  ) else (
    echo Engine2 did not start. Check that Node.js and npm are installed.
  )
  pause
)
