@echo off
setlocal
cd /d "%~dp0"
set "NODE=%LOCALAPPDATA%\ReputationRuntime\node-v22.22.0-win-x64\node.exe"
if not exist "%NODE%" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js 22.13 or newer is required.
    pause
    exit /b 1
  )
  set "NODE=node"
)
"%NODE%" scripts\launch.mjs
if errorlevel 1 pause