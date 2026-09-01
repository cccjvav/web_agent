@echo off
chcp 65001 >nul
setlocal EnableExtensions
title ShunCode tests
cd /d "%~dp0"

echo ===========================================================
echo   ShunCode  运行产品测试  ^(Windows CMD^)
echo ===========================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Node.js。请先运行 check-env.cmd
  pause
  exit /b 1
)

cd /d "%~dp0shuncode-core\agent-host"
if not exist "node_modules\express" (
  echo 正在安装依赖 npm install ...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [错误] npm install 失败。
    pause
    exit /b 1
  )
)

echo.
echo 测试目录: shuncode-core\agent-host\tests
echo.
call npm test
set "ERR=%ERRORLEVEL%"
echo.
if not "%ERR%"=="0" (
  echo [失败] 退出代码 %ERR%。说明见仓库根目录 测试说明.md
  pause
  exit /b %ERR%
)

echo [通过] agent-host 全部测试成功。
echo 说明：仓库根不必再单独建 tests\ 文件夹，测试已经放在上面这个目录。
echo.
pause
exit /b 0
