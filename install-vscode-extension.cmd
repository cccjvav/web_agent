@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Node.js。先运行 check-env.cmd
  pause
  exit /b 1
)

echo 把 Web Agent 插件装进本机桌面 VS Code（%%USERPROFILE%%\.vscode\extensions）
echo 不会启动网页版 VS Code，也不会占用 3000 口。
echo.
node "%~dp0webagent-core\scripts\install-desktop-extension.js"
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" (
  echo.
  echo [错误] 安装失败，退出代码 %ERR%
  pause
  exit /b %ERR%
)
echo.
echo 然后：run-webagent.cmd 你的仓库路径
echo VS Code 打开同一个文件夹。细节见 使用指南.md 第 5 节。
pause
exit /b 0
