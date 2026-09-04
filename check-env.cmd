@echo off
chcp 65001 >nul
setlocal
echo === Web Agent Windows 环境检查 ===
echo.
where node >nul 2>&1 && (for /f "tokens=*" %%i in ('node -v') do echo Node.js     %%i) || echo Node.js     未安装  https://nodejs.org/
where npm >nul 2>&1 && (for /f "tokens=*" %%i in ('npm -v') do echo npm         %%i) || echo npm         未安装
where git >nul 2>&1 && (for /f "tokens=*" %%i in ('git --version') do echo %%i) || echo Git         未安装  https://git-scm.com/download/win
where cloudflared >nul 2>&1 && (echo cloudflared 已在 PATH) || echo cloudflared 未安装  运行: winget install --id Cloudflare.cloudflared
echo.
echo 检查完毕。缺什么就按上面的链接/命令安装，然后新开一个 CMD。
echo.
pause
