@echo off
setlocal

cd /d "%~dp0\..\.."

where cargo >nul 2>&1
if %errorlevel% neq 0 (
  echo Cargo/Rust is required. Install Rust and run this script again.
  exit /b 1
)

call npm install
if %errorlevel% neq 0 exit /b %errorlevel%

call npx tauri icon web\frxe-icon.svg --output src-tauri\icons
if %errorlevel% neq 0 exit /b %errorlevel%

call npm run check
if %errorlevel% neq 0 exit /b %errorlevel%

call npx tauri build --bundles msi
if %errorlevel% neq 0 exit /b %errorlevel%

set "MSI_SOURCE=src-tauri\target\release\bundle\msi\Frxe Desktop_1.2.4_x64_en-US.msi"
if not exist "%MSI_SOURCE%" (
  echo Built MSI not found: %MSI_SOURCE%
  exit /b 1
)

if not exist "release-upload" mkdir "release-upload"
copy /Y "%MSI_SOURCE%" "release-upload\Frxe-Desktop-1.2.4-x64.msi" >nul

echo.
echo Built release-upload\Frxe-Desktop-1.2.4-x64.msi
exit /b 0
