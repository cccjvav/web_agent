#!/bin/bash
set -e

echo "==========================================================="
echo "🚀 Bootstrapping ShunCode Suite..."
echo "==========================================================="

# 1. Install dependencies for agent-host if needed
if [ ! -d "/home/user/shuncode-core/agent-host/node_modules/express" ]; then
  echo "📦 Installing agent-host dependencies..."
  cd /home/user/shuncode-core/agent-host && npm install express ws cors diff --silent
fi

# 2. Install dependencies for studio if needed
if [ ! -d "/home/user/shuncode-repro/node_modules/express" ]; then
  echo "📦 Installing studio dependencies..."
  cd /home/user/shuncode-repro && npm install express ws cors diff --silent
fi

# 3. Ensure code-server is installed
if [ ! -f "/home/user/code-server-app/bin/code-server" ]; then
  echo "⬇️ Installing Code-OSS (code-server carrier)..."
  curl -fsSL https://code-server.dev/install.sh -o /tmp/install.sh
  sh /tmp/install.sh --prefix /home/user/code-server-app --method standalone
fi

# 4. Prepare Extension Directory
mkdir -p /home/user/shuncode-core/extensions-installed/shuncode.shuncode-core-0.6.9
cp -r /home/user/shuncode-core/extension/* /home/user/shuncode-core/extensions-installed/shuncode.shuncode-core-0.6.9/

# 5. Clean up old processes
pkill -f "agent-host" || true
pkill -f "code-server" || true
sleep 1

# 6. Start independent agent-host (Port 48271)
echo "🤖 Starting agent-host on port 48271..."
node /home/user/shuncode-core/agent-host/src/index.js &
AGENT_HOST_PID=$!
sleep 1

# 7. Start Code-OSS (Port 3000)
echo "💻 Launching Code-OSS Carrier on 0.0.0.0:3000..."
exec /home/user/code-server-app/bin/code-server \
  --bind-addr 0.0.0.0:3000 \
  --auth none \
  --disable-telemetry \
  --disable-update-check \
  --extensions-dir /home/user/shuncode-core/extensions-installed \
  /home/user/workspace
