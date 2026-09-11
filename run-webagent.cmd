@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion
where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到Node.js，请安装Node LTS后重新打开CMD。
  exit /b 1
)
rem Preserve caller cwd: relative workspaces resolve where the command was invoked.
node "%~dp0installer\launch.js" classic "%~1"
exit /b %ERRORLEVEL%
