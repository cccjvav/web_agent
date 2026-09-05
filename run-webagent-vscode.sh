#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
if [ -n "${1-}" ]; then
  export WORKSPACE_ROOT="$1"
fi
export WORKSPACE_ROOT="${WORKSPACE_ROOT:-$ROOT/workspace}"
export AGENT_HOST_PORT="${AGENT_HOST_PORT:-48271}"
export CODE_SERVER_PORT="${CODE_SERVER_PORT:-3000}"

if ! command -v node >/dev/null 2>&1; then
  echo "[error] Node.js not found. Run check-env / install LTS: https://nodejs.org/" >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "[error] npm not found. Reinstall Node.js LTS and include npm." >&2
  exit 1
fi
if [ ! -d "$WORKSPACE_ROOT" ]; then
  echo "[error] workspace does not exist: $WORKSPACE_ROOT" >&2
  echo "Usage: ./run-webagent-vscode.sh /path/to/my-app" >&2
  exit 1
fi

exec node "$ROOT/webagent-core/scripts/run-code-oss.js" "$WORKSPACE_ROOT"
