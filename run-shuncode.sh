#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
export WORKSPACE_ROOT="${WORKSPACE_ROOT:-$ROOT/workspace}"
export AGENT_HOST_PORT="${AGENT_HOST_PORT:-48271}"
export WORKBENCH_PORT="${WORKBENCH_PORT:-3000}"

echo "==========================================================="
echo "  ShunCode 0.6.9  workbench + independent agent-host"
echo "==========================================================="

cd "$ROOT/shuncode-core/agent-host"
if [ ! -d node_modules/express ]; then
  echo "Installing agent-host dependencies..."
  npm install --no-audit --no-fund
fi

exec node src/index.js
