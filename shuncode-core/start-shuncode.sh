#!/bin/bash
set -e

# Cleanup old processes if any
pkill -f "agent-host" || true
pkill -f "code-server" || true
sleep 1

echo "==========================================================="
echo "🚀 Starting ShunCode (Code-OSS + Independent agent-host)..."
echo "==========================================================="

# 1. Start independent agent-host on 48271
node /home/user/shuncode-core/agent-host/src/index.js &
AGENT_HOST_PID=$!
echo "🤖 agent-host process started (PID: $AGENT_HOST_PID)"

sleep 1

# 2. Start Code-OSS (code-server carrier) on 0.0.0.0:3000
echo "💻 Launching Code-OSS Carrier on 0.0.0.0:3000..."
exec /home/user/code-server-app/bin/code-server \
  --bind-addr 0.0.0.0:3000 \
  --auth none \
  --disable-telemetry \
  --disable-update-check \
  --extensions-dir /home/user/shuncode-core/extensions-installed \
  /home/user/workspace
