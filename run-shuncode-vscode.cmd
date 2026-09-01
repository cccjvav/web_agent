@echo off
chcp 65001 >nul
setlocal EnableExtensions
title ShunCode + VS Code Web
cd /d "%~dp0"

if not "%~1"=="" set "WORKSPACE_ROOT=%~1"
if not defined WORKSPACE_ROOT set "WORKSPACE_ROOT=%~dp0workspace"

echo ===========================================================
echo   ShunCode + 网页 VS Code  ^(Windows CMD^)
echo ===========================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Node.js。先运行 check-env.cmd
  pause
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [错误] 没有 npm。请重装 Node.js LTS。
  pause
  exit /b 1
)

if not exist "%WORKSPACE_ROOT%" (
  echo [错误] 工作区不存在：
  echo   %WORKSPACE_ROOT%
  echo 用法: run-shuncode-vscode.cmd D:\code\my-app
  pause
  exit /b 1
)

echo 第一次会从 npm 下载 code-server 4.135.0（约 50MB + 依赖）。
echo 请不要和 run-shuncode.cmd 同时开（都要用 3000 端口）。
echo 停止: 本窗口 Ctrl+C
echo.

node "%~dp0shuncode-core\scripts\run-code-oss.js" "%WORKSPACE_ROOT%"
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" (
  echo.
  echo [错误] 退出代码 %ERR%
  echo 说明见 网页VSCode使用指南.md
  pause
)
exit /b %ERR%
