@echo off
setlocal
cd /d "%~dp0"
if not defined WORKSPACE_ROOT set "WORKSPACE_ROOT=%~dp0workspace"
set "AGENT_HOST_PORT=48271"
set "WORKBENCH_PORT=3000"

echo ===========================================================
echo   ShunCode  workbench + agent-host  (Windows)
echo ===========================================================

where node >nul 2>&1
if errorlevel 1 (
  echo 未找到 Node.js。请先安装 https://nodejs.org/  ^(LTS^) 后重开终端。
  exit /b 1
)

cd /d "%~dp0shuncode-core\agent-host"
if not exist "node_modules\express" (
  echo Installing agent-host dependencies...
  call npm install --no-audit --no-fund
)

echo.
echo 本机界面:  http://127.0.0.1:3000
echo MCP 端口:  48271  ^(启动 Bridge 后会再给出 trycloudflare.com^)
echo 工作区:    %WORKSPACE_ROOT%
echo.
echo 若要用 ChatGPT 改本机仓库: 先 winget install --id Cloudflare.cloudflared
echo 然后在工作台里点「启动 Bridge」→「复制提示词」贴进 ChatGPT。
echo.

node src\index.js
