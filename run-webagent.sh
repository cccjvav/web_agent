#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
if [ -n "${1-}" ]; then
  export WORKSPACE_ROOT="$1"
fi
export WORKSPACE_ROOT="${WORKSPACE_ROOT:-$ROOT/workspace}"
export AGENT_HOST_PORT="${AGENT_HOST_PORT:-48271}"
export WORKBENCH_PORT="${WORKBENCH_PORT:-3000}"

echo "==========================================================="
echo "  Web Agent  workbench + independent agent-host"
echo "==========================================================="

if ! command -v node >/dev/null 2>&1; then
  echo "[error] Node.js not found. Install LTS: https://nodejs.org/" >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "[error] npm not found. Reinstall Node.js LTS and include npm." >&2
  exit 1
fi

if [ ! -d "$WORKSPACE_ROOT" ]; then
  if [ -n "${1-}" ]; then
    echo "[error] workspace does not exist: $WORKSPACE_ROOT" >&2
    echo "Pass an existing folder, e.g. ./run-webagent.sh /path/to/my-app" >&2
    exit 1
  fi
  mkdir -p "$WORKSPACE_ROOT"
fi

echo "Workspace  $WORKSPACE_ROOT"
echo "UI         http://127.0.0.1:${WORKBENCH_PORT}"
echo "MCP port   ${AGENT_HOST_PORT}"

cd "$ROOT/webagent-core/agent-host"
if [ ! -d node_modules/express ]; then
  echo "Installing agent-host dependencies..."
  npm install --no-audit --no-fund
fi

exec node src/index.js
