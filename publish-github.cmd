@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "NODE=%LOCALAPPDATA%\ReputationRuntime\node-v22.22.0-win-x64\node.exe"
if not exist "%NODE%" set "NODE=node"
"%NODE%" scripts\publish-github.mjs
pause
