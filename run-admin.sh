#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export WEBAGENT_ADMIN_PORT="${WEBAGENT_ADMIN_PORT:-4174}"
echo "[webagent-admin] 独立进程，默认端口 ${WEBAGENT_ADMIN_PORT}"
echo "[webagent-admin] 主工作台不会自动打开这个端口。"
exec node webagent-core/admin-host/index.js
