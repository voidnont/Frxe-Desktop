@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo                    FRXE DESKTOP BUILD
echo ============================================================

echo [1/4] Checking tools...
where git >nul 2>nul || (echo [ERROR] Git is required.& exit /b 1)
where node >nul 2>nul || (echo [ERROR] Node.js 20+ is required.& exit /b 1)
where npm >nul 2>nul || (echo [ERROR] npm is required.& exit /b 1)
where cargo >nul 2>nul || (echo [ERROR] Rust/Cargo is required.& exit /b 1)

for /f "tokens=*" %%V in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%V
if %NODE_MAJOR% LSS 20 (echo [ERROR] Node.js 20+ is required.& exit /b 1)

echo [2/4] Installing Tauri CLI...
call npm install
if errorlevel 1 exit /b 1

echo [3/4] Running frontend checks...
call npm run check
if errorlevel 1 exit /b 1

echo [4/4] Building Frxe Desktop MSI...
call npm run tauri:build
if errorlevel 1 exit /b 1

if not exist release-upload mkdir release-upload
set FOUND=
for /r "src-tauri\target\release\bundle\msi" %%F in (*.msi) do (
  copy /y "%%~fF" "release-upload\Frxe-Desktop-0.1.0-x64.msi" >nul
  set FOUND=1
)

if not defined FOUND (
  echo [ERROR] Tauri finished but no MSI was found.
  exit /b 1
)

echo.
echo ============================================================
echo [OK] release-upload\Frxe-Desktop-0.1.0-x64.msi
echo ============================================================
exit /b 0
