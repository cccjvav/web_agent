@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Web Agent app window
cd /d "%~dp0"
set "URL=http://127.0.0.1:3000"

netstat -ano | findstr /C:":3000" | findstr /C:"LISTENING" >nul 2>&1
if errorlevel 1 (
  echo 端口 3000 没有主程序，先在后台拉起 VS Code 壳（首跑要下载 code-server，请稍候）...
  start "Web Agent shell" /min "%~dp0run-webagent-vscode.cmd"
  timeout /t 5 /nobreak >nul
)

set "BROWSER="
for %%C in (msedge.exe chrome.exe) do where %%C >nul 2>&1 && set "BROWSER=%%C"
if not defined BROWSER for %%P in ("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe") do if exist %%P set "BROWSER=%%P"

if defined BROWSER (start "" "%BROWSER%" --app=%URL%) else (start "" %URL%)
exit /b 0
