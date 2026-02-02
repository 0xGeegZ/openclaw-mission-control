#!/bin/bash
# Startup script for OpenClaw gateway in Docker (Mission Control local dev).
# 1. Initializes config from template on first run
# 2. Merges environment variables into clawdbot.json
# 3. Starts the gateway

set -e

if pgrep -f "clawdbot gateway" > /dev/null 2>&1; then
  echo "OpenClaw gateway is already running, exiting."
  exit 0
fi

CONFIG_DIR="/root/.clawdbot"
CONFIG_FILE="$CONFIG_DIR/clawdbot.json"
TEMPLATE_DIR="/root/.clawdbot-templates"
TEMPLATE_FILE="$TEMPLATE_DIR/openclaw.json.template"

mkdir -p "$CONFIG_DIR"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "No existing config found, initializing from template..."
  if [ -f "$TEMPLATE_FILE" ]; then
    cp "$TEMPLATE_FILE" "$CONFIG_FILE"
  else
    cat > "$CONFIG_FILE" << 'EOFCONFIG'
{
  "agents": { "defaults": { "workspace": "/root/clawd" } },
  "gateway": { "port": 18789, "mode": "local" }
}
EOFCONFIG
  fi
else
  echo "Using existing config"
fi

# Merge env into config
node << 'EOFNODE'
const fs = require('fs');
const configPath = '/root/.clawdbot/clawdbot.json';
let config = {};
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  console.log('Starting with empty config');
}

config.agents = config.agents || {};
config.agents.defaults = config.agents.defaults || {};
config.agents.defaults.model = config.agents.defaults.model || {};
config.gateway = config.gateway || {};
config.channels = config.channels || {};
const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
if (hasAnthropic || hasOpenAI) {
  delete config.agents.defaults.model.primary;
}

config.gateway.port = 18789;
config.gateway.mode = 'local';
config.gateway.controlUi = config.gateway.controlUi || {};
config.gateway.controlUi.allowInsecureAuth = true;

config.browser = config.browser || {};
config.browser.enabled = true;
config.browser.executablePath = '/usr/bin/chromium';
config.browser.headless = true;
config.browser.noSandbox = true;
config.browser.defaultProfile = 'clawd';

if (process.env.CLAWDBOT_GATEWAY_TOKEN) {
  config.gateway.auth = config.gateway.auth || {};
  config.gateway.auth.token = process.env.CLAWDBOT_GATEWAY_TOKEN;
}

if (hasAnthropic) {
  config.models = config.models || {};
  config.models.providers = config.models.providers || {};
  config.models.providers.anthropic = {
    apiKey: process.env.ANTHROPIC_API_KEY,
    api: 'anthropic-messages',
    models: [
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', contextWindow: 200000 },
    ],
  };
  config.agents.defaults.model.primary = 'anthropic/claude-sonnet-4-5-20250929';
}

if (hasOpenAI) {
  config.models = config.models || {};
  config.models.providers = config.models.providers || {};
  config.models.providers.openai = config.models.providers.openai || {
    api: 'openai-responses',
    models: [{ id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000 }],
  };
  config.agents.defaults.models = config.agents.defaults.models || {};
  config.agents.defaults.models['openai/gpt-4o'] = { alias: 'GPT-4o' };
  if (!hasAnthropic) {
    config.agents.defaults.model.primary = 'openai/gpt-4o';
  }
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('Configuration updated successfully');
EOFNODE

rm -f /tmp/clawdbot-gateway.lock "$CONFIG_DIR/gateway.lock" 2>/dev/null || true
find "$CONFIG_DIR" -name "*.lock" -delete 2>/dev/null || true
find "$CONFIG_DIR" -name "SingletonLock" -delete 2>/dev/null || true
find "$CONFIG_DIR" -name "SingletonSocket" -delete 2>/dev/null || true
find "$CONFIG_DIR" -name "SingletonCookie" -delete 2>/dev/null || true

TOKEN="${CLAWDBOT_GATEWAY_TOKEN:-local}"
echo ""
echo "============================================================"
echo " Open the Control UI at: http://localhost:18789/?token=${TOKEN}"
echo "============================================================"
echo ""

echo "Starting Chromium (headless, CDP on port 18800)..."
chromium \
  --headless --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --remote-debugging-port=18800 --remote-debugging-address=127.0.0.1 \
  --user-data-dir=/root/.clawdbot/browser/clawd/user-data \
  about:blank 2>/dev/null &
CHROMIUM_PID=$!
sleep 2
if kill -0 $CHROMIUM_PID 2>/dev/null; then
  echo "Chromium started (PID $CHROMIUM_PID)"
else
  echo "WARNING: Chromium failed to start. Browser automation may be unavailable."
fi

clawdbot gateway --port 18789 --verbose --allow-unconfigured --bind lan --token "$TOKEN" &
GATEWAY_PID=$!
trap "kill $GATEWAY_PID $CHROMIUM_PID 2>/dev/null; wait" SIGTERM SIGINT
wait $GATEWAY_PID
EXIT_CODE=$?
kill $CHROMIUM_PID 2>/dev/null
exit $EXIT_CODE
