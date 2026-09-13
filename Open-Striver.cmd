@echo off
setlocal
rem Open the existing private workspace so saved study progress stays together.
set "STRIVER_URL=https://kapil-dsa-practice.kapiltripathi267.chatgpt.site"
set "STRIVER_CHROME="
for /f "delims=" %%I in ('where chrome.exe 2^>nul') do if not defined STRIVER_CHROME set "STRIVER_CHROME=%%I"
if not defined STRIVER_CHROME if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "STRIVER_CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined STRIVER_CHROME if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "STRIVER_CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined STRIVER_CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "STRIVER_CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined STRIVER_CHROME (
  echo Google Chrome could not be found. Open this address in Chrome:
  echo %STRIVER_URL%
  pause
  exit /b 1
)
start "" "%STRIVER_CHROME%" "%STRIVER_URL%"
exit /b %errorlevel%
