@echo off
setlocal
cd /d "%~dp0"
if exist .git git submodule update --init --recursive
call npm install
if errorlevel 1 exit /b 1
call npm run tauri:dev
