#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
export WORKSPACE_ROOT="${1:-${WORKSPACE_ROOT:-$ROOT/workspace}}"
export AGENT_HOST_PORT="${AGENT_HOST_PORT:-48271}"
export CODE_SERVER_PORT="${CODE_SERVER_PORT:-3000}"
exec node "$ROOT/webagent-core/scripts/run-code-oss.js" "$WORKSPACE_ROOT"
