@echo off
setlocal
cd /d "%~dp0"
if not defined WEBAGENT_ADMIN_PORT set WEBAGENT_ADMIN_PORT=4174
echo [webagent-admin] 独立进程，默认端口 %WEBAGENT_ADMIN_PORT%
echo [webagent-admin] 主工作台不会自动打开这个端口。
node webagent-core\admin-host\index.js
