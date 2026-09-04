@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Web Agent
cd /d "%~dp0"

if not "%~1"=="" set "WORKSPACE_ROOT=%~1"
if not defined WORKSPACE_ROOT set "WORKSPACE_ROOT=%~dp0workspace"

set "AGENT_HOST_PORT=48271"
set "WORKBENCH_PORT=3000"

echo ===========================================================
echo   Web Agent  workbench + agent-host  ^(Windows CMD^)
echo ===========================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Node.js。
  echo 请安装 LTS： https://nodejs.org/
  echo 安装完成后关掉本窗口，重新打开 CMD 再运行本脚本。
  echo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [错误] 找到了 node，但没有 npm。请重装 Node.js LTS 并勾选 npm。
  pause
  exit /b 1
)

if not exist "%WORKSPACE_ROOT%" (
  if "%~1"=="" (
    mkdir "%WORKSPACE_ROOT%"
  ) else (
    echo [错误] 工作区不存在：
    echo   %WORKSPACE_ROOT%
    echo 请先确认路径，例如：
    echo   run-webagent.cmd D:\code\my-repo
    echo.
    pause
    exit /b 1
  )
)

for /f "tokens=*" %%i in ('node -v') do echo Node        %%i
for /f "tokens=*" %%i in ('npm -v') do echo npm         %%i
where git >nul 2>&1
if errorlevel 1 (
  echo Git         未安装  ^(git_status / git_diff 不可用，其它功能仍可运行^)
) else (
  for /f "tokens=*" %%i in ('git --version') do echo %%i
)
where cloudflared >nul 2>&1
if errorlevel 1 (
  echo cloudflared 未安装  ^(本地 Chat 可用；ChatGPT Bridge 需要先安装^)
) else (
  echo cloudflared 已找到
)

echo.
echo 工作区:     %WORKSPACE_ROOT%
echo 本机界面:   http://127.0.0.1:3000
echo MCP 端口:   48271
echo.
echo 停止服务: 在本窗口按 Ctrl+C
echo.

cd /d "%~dp0webagent-core\agent-host"
if not exist "node_modules\express" (
  echo 正在安装依赖 npm install ...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [错误] npm install 失败。
    pause
    exit /b 1
  )
)

node src\index.js
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" (
  echo.
  echo [错误] 进程退出代码 %ERR%
  echo 若提示端口被占用，关掉其它 Web Agent / 占用 3000、48271 的程序后再开。
  pause
)
exit /b %ERR%
