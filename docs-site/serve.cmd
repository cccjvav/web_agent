@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Web Agent docs
where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Node.js。
  pause
  exit /b 1
)
node serve.js
pause
