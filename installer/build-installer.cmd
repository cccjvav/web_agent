@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

set "ISCC="
if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"
where iscc >nul 2>&1 && set "ISCC=iscc"

if not defined ISCC (
  echo [错误] 未找到 Inno Setup 6 的 ISCC.exe。
  echo   安装：https://jrsoftware.org/isinfo.php （免费，勾选中文语言包）
  pause
  exit /b 1
)

node package.js
if errorlevel 1 exit /b 1

echo 编译安装器：webagent.iss
"%ISCC%" /Qp webagent.iss
if errorlevel 1 (
  echo [错误] 编译失败，见上方 ISCC 输出。
  pause
  exit /b 1
)
echo 完成：installer\output\webagent-setup-*.exe
endlocal
