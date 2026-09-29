@echo off
set "APP_DIR=%~dp0"
set "ELECTRON_EXE=%APP_DIR%node_modules\electron\dist\electron.exe"

if not exist "%ELECTRON_EXE%" (
  echo Electron is not installed for Meeting Airplane.
  echo Run npm install in "%APP_DIR%" first.
  pause
  exit /b 1
)

pushd "%APP_DIR%" || exit /b 1
start "" "%ELECTRON_EXE%" .
popd
