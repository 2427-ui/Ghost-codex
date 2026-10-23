@echo off
setlocal
cd /d "%~dp0"
if exist "dist\win-unpacked\GhostStudio.exe" (
  start "" "dist\win-unpacked\GhostStudio.exe"
  exit /b 0
)
call npm.cmd run build
if errorlevel 1 (
  echo Build failed. Run npm.cmd ci first, then try again.
  pause
  exit /b 1
)
call npm.cmd run preview
