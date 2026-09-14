@echo off
setlocal EnableExtensions
cd /d "%~dp0\..\.."

echo ============================================================
echo                FRXE DESKTOP WINDOWS BUILD
echo ============================================================

where node >nul 2>nul || (echo [ERROR] Node.js 20+ is required.& exit /b 1)
where npm >nul 2>nul || (echo [ERROR] npm is required.& exit /b 1)
where cargo >nul 2>nul || (echo [ERROR] Rust/Cargo is required.& exit /b 1)

for /f "tokens=*" %%V in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%V
if %NODE_MAJOR% LSS 20 (echo [ERROR] Node.js 20+ is required.& exit /b 1)

call npm install
if errorlevel 1 exit /b 1
call npm run check
if errorlevel 1 exit /b 1
call cargo test --manifest-path src-tauri\Cargo.toml
if errorlevel 1 exit /b 1
call npm run tauri:build:windows
if errorlevel 1 exit /b 1

if not exist release-upload mkdir release-upload
set MSI=
set SIG=
for /r "src-tauri\target\release\bundle\msi" %%F in (*.msi) do if not defined MSI set MSI=%%~fF
for /r "src-tauri\target\release\bundle\msi" %%F in (*.msi.sig) do if not defined SIG set SIG=%%~fF
if not defined MSI (echo [ERROR] Tauri finished without an MSI.& exit /b 1)
if not defined SIG (echo [ERROR] Tauri finished without an updater MSI signature.& exit /b 1)

copy /y "%MSI%" "release-upload\Frxe-Desktop-1.2.2-x64.msi" >nul
copy /y "%SIG%" "release-upload\Frxe-Desktop-1.2.2-x64.msi.sig" >nul

echo [OK] release-upload\Frxe-Desktop-1.2.2-x64.msi
exit /b 0
