#!/bin/bash
# Startup script for OpenClaw gateway in Docker (OpenClaw Mission Control local dev).
# 1. Initializes config from template on first run
# 2. Merges environment variables into clawdbot.json
# 3. Starts the gateway

set -e

if pgrep -f "clawdbot gateway" > /dev/null 2>&1; then
  echo "OpenClaw gateway is already running, exiting."
  exit 0
fi

if [ -n "${VERCEL_AI_GATEWAY_API_KEY:-}" ] && [ -z "${AI_GATEWAY_API_KEY:-}" ]; then
  export AI_GATEWAY_API_KEY="$VERCEL_AI_GATEWAY_API_KEY"
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

# Merge env into config (enforced each boot: Vercel gateway, Haiku/Sonnet, skills, browser)
node << 'EOFNODE'
const fs = require('fs');
const path = require('path');
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
config.agents.defaults.models = config.agents.defaults.models || {};
config.gateway = config.gateway || {};
config.channels = config.channels || {};
config.auth = config.auth || {};
config.auth.profiles = config.auth.profiles || {};
if (config.auth.profiles['vercel-ai-gateway:default']) {
  delete config.auth.profiles['vercel-ai-gateway:default'].apiKey;
}
config.skills = config.skills || {};
config.skills.install = config.skills.install || { nodeManager: 'npm' };
config.skills.entries = config.skills.entries || {};

/** Inject GitHub auth token for gh CLI in sandboxed exec. */
const githubToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (githubToken) {
  config.agents.defaults.sandbox = config.agents.defaults.sandbox || {};
  config.agents.defaults.sandbox.docker = config.agents.defaults.sandbox.docker || {};
  config.agents.defaults.sandbox.docker.env = config.agents.defaults.sandbox.docker.env || {};
  config.agents.defaults.sandbox.docker.env.GH_TOKEN = githubToken;
  config.agents.defaults.sandbox.docker.env.GITHUB_TOKEN = githubToken;
}

const hasVercelKey = Boolean(process.env.VERCEL_AI_GATEWAY_API_KEY);

// Gateway and browser (always enforced)
config.gateway.port = 18789;
config.gateway.mode = 'local';
config.gateway.http = config.gateway.http || {};
config.gateway.http.endpoints = config.gateway.http.endpoints || {};
config.gateway.http.endpoints.responses = config.gateway.http.endpoints.responses || {};
config.gateway.http.endpoints.responses.enabled = true;
config.gateway.controlUi = config.gateway.controlUi || {};
config.gateway.controlUi.allowInsecureAuth = true;
config.browser = config.browser || {};
config.browser.enabled = true;
config.browser.executablePath = '/usr/bin/chromium';
config.browser.headless = true;
config.browser.noSandbox = true;
config.browser.defaultProfile = 'clawd';

if (process.env.OPENCLAW_GATEWAY_TOKEN) {
  config.gateway.auth = config.gateway.auth || {};
  config.gateway.auth.token = process.env.OPENCLAW_GATEWAY_TOKEN;
}

// Vercel AI Gateway: auth profile + model defaults (Haiku primary, Sonnet fallback)
if (hasVercelKey) {
  config.auth.profiles['vercel-ai-gateway:default'] = {
    provider: 'vercel-ai-gateway',
    mode: 'api_key',
  };
  config.env = config.env || {};
  const gatewayKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY;
  if (gatewayKey) {
    config.env.AI_GATEWAY_API_KEY = gatewayKey;
  }
  config.agents.defaults.model.primary = 'vercel-ai-gateway/anthropic/claude-haiku-4.5';
  config.agents.defaults.model.fallbacks = ['vercel-ai-gateway/anthropic/claude-sonnet-4.5'];
  config.agents.defaults.models['vercel-ai-gateway/anthropic/claude-haiku-4.5'] = { alias: 'Claude Haiku 4.5' };
  config.agents.defaults.models['vercel-ai-gateway/anthropic/claude-sonnet-4.5'] = { alias: 'Claude Sonnet 4.5' };
} else {
  // Legacy: only if Vercel key not set (Anthropic/OpenAI from env)
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  if (hasAnthropic) {
    config.models = config.models || {};
    config.models.providers = config.models.providers || {};
    config.models.providers.anthropic = {
      apiKey: process.env.ANTHROPIC_API_KEY,
      api: 'anthropic-messages',
      models: [{ id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', contextWindow: 200000 }],
    };
    config.agents.defaults.model.primary = 'anthropic/claude-sonnet-4-5-20250929';
    config.agents.defaults.model.fallbacks = config.agents.defaults.model.fallbacks || [];
  }
  if (hasOpenAI) {
    config.models = config.models || {};
    config.models.providers = config.models.providers || {};
    config.models.providers.openai = config.models.providers.openai || {
      api: 'openai-responses',
      models: [{ id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000 }],
    };
    config.agents.defaults.models['openai/gpt-4o'] = { alias: 'GPT-4o' };
    if (!hasAnthropic) {
      config.agents.defaults.model.primary = 'openai/gpt-4o';
      config.agents.defaults.model.fallbacks = config.agents.defaults.model.fallbacks || [];
    }
  }
}

// Skills: merge ready skills (idempotent enable)
const readySkills = [
  'peekaboo', 'bird', 'bluebubbles', 'clawdhub', 'openai-image-gen', 'openai-whisper-api',
  'video-frames', 'weather', 'apple-reminders', 'cron-gen', 'sql-gen', 'bankr', 'base',
  'clanker', 'ens-primary-name', 'neynar', 'onchainkit', 'qrcoin', 'yoink', 'zapper',
  'calendar', 'evm-wallet-skill', 'markdown-converter', 'postgres', 'remind-me',
];
readySkills.forEach((id) => {
  config.skills.entries[id] = config.skills.entries[id] || {};
  config.skills.entries[id].enabled = true;
});

// Commands for native/skill execution
config.commands = config.commands || {};
config.commands.native = config.commands.native || 'auto';
config.commands.nativeSkills = config.commands.nativeSkills || 'auto';

/**
 * Recursively collect session store files under the OpenClaw data root.
 */
function collectSessionStores(rootDir) {
  const stores = [];
  if (!fs.existsSync(rootDir)) return stores;
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === 'sessions.json') {
        const normalized = fullPath.replace(/\\/g, '/');
        if (normalized.includes('/sessions/sessions.json')) {
          stores.push(fullPath);
        }
      }
    }
  }
  return stores;
}

/**
 * Normalize updatedAt values to milliseconds since epoch.
 */
function parseUpdatedAt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed < 1e12 ? parsed * 1000 : parsed;
    }
  }
  return null;
}

/**
 * Prune a session store by removing entries older than the cutoff.
 */
function pruneSessionStore(storePath, cutoffMs, clearAll) {
  let raw = '';
  try {
    raw = fs.readFileSync(storePath, 'utf8');
  } catch {
    return 0;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return 0;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return 0;
  }
  let removed = 0;
  for (const [key, entry] of Object.entries(data)) {
    if (clearAll) {
      delete data[key];
      removed += 1;
      continue;
    }
    const updatedAt = parseUpdatedAt(entry && entry.updatedAt);
    if (updatedAt !== null && updatedAt < cutoffMs) {
      delete data[key];
      removed += 1;
    }
  }
  if (removed > 0) {
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
  }
  return removed;
}

/**
 * Prune OpenClaw session stores based on OPENCLAW_SESSION_RETENTION_DAYS.
 */
function pruneSessionsIfConfigured() {
  if (process.env.OPENCLAW_SESSION_RETENTION_DAYS === undefined) return;
  const raw = process.env.OPENCLAW_SESSION_RETENTION_DAYS.trim();
  if (!raw) return;
  const retentionDays = Number(raw);
  if (!Number.isFinite(retentionDays) || retentionDays < 0) {
    console.warn('OPENCLAW_SESSION_RETENTION_DAYS must be a non-negative number; skipping prune.');
    return;
  }
  const dataRoot = '/root/.clawdbot';
  const stores = collectSessionStores(dataRoot);
  if (stores.length === 0) return;
  const clearAll = retentionDays === 0;
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let totalRemoved = 0;
  for (const storePath of stores) {
    totalRemoved += pruneSessionStore(storePath, cutoffMs, clearAll);
  }
  if (totalRemoved > 0) {
    const mode = clearAll ? 'cleared' : `pruned (>${retentionDays} days old)`;
    console.log(`Session store ${mode}: removed ${totalRemoved} entries`);
  }
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('Configuration updated successfully');
try {
  pruneSessionsIfConfigured();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn('Session prune failed:', message);
}
EOFNODE

rm -f /tmp/clawdbot-gateway.lock "$CONFIG_DIR/gateway.lock" 2>/dev/null || true
find "$CONFIG_DIR" -name "*.lock" -delete 2>/dev/null || true
find "$CONFIG_DIR" -name "SingletonLock" -delete 2>/dev/null || true
find "$CONFIG_DIR" -name "SingletonSocket" -delete 2>/dev/null || true
find "$CONFIG_DIR" -name "SingletonCookie" -delete 2>/dev/null || true

TOKEN="${OPENCLAW_GATEWAY_TOKEN-local}"
echo ""
echo "============================================================"
if [ -n "$TOKEN" ]; then
  echo " Open the Control UI at: http://localhost:18789/?token=${TOKEN}"
else
  echo " Open the Control UI at: http://localhost:18789/"
fi
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

if [ -n "$TOKEN" ]; then
  clawdbot gateway --port 18789 --verbose --allow-unconfigured --bind lan --token "$TOKEN" &
else
  clawdbot gateway --port 18789 --verbose --allow-unconfigured --bind local &
fi
GATEWAY_PID=$!
trap "kill $GATEWAY_PID $CHROMIUM_PID 2>/dev/null; wait" SIGTERM SIGINT
wait $GATEWAY_PID
EXIT_CODE=$?
kill $CHROMIUM_PID 2>/dev/null
exit $EXIT_CODE
