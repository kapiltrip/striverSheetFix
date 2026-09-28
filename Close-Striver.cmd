@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\close-local.ps1"
set "STRIVER_EXIT=%ERRORLEVEL%"
if not "%STRIVER_EXIT%"=="0" pause
exit /b %STRIVER_EXIT%
