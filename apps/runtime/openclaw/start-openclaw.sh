#!/bin/bash
# Startup script for OpenClaw gateway in Docker (OpenClaw Mission Control local dev).
# 1. Initializes config from template on first run
# 2. Merges environment variables into openclaw.json
# 3. Starts the gateway

set -e

if pgrep -f "openclaw gateway" > /dev/null 2>&1 || pgrep -f "clawdbot gateway" > /dev/null 2>&1; then
  echo "OpenClaw gateway is already running, exiting."
  exit 0
fi

CLI_BIN="clawdbot"
if command -v openclaw > /dev/null 2>&1; then
  CLI_BIN="openclaw"
fi

if [ -n "${VERCEL_AI_GATEWAY_API_KEY:-}" ] && [ -z "${AI_GATEWAY_API_KEY:-}" ]; then
  export AI_GATEWAY_API_KEY="$VERCEL_AI_GATEWAY_API_KEY"
fi

CONFIG_DIR="/root/.openclaw"
CONFIG_FILE="$CONFIG_DIR/openclaw.json"
# Runtime-generated agent list (written by mission-control runtime); merged into config at startup and optionally on reload.
OPENCLAW_CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-/root/clawd/openclaw.json}"
# Per-agent workspace root used by OpenClaw sessions. Must exist before first delivery.
OPENCLAW_WORKSPACE_ROOT="${OPENCLAW_WORKSPACE_ROOT:-/root/clawd/agents}"
TEMPLATE_DIR="/root/.openclaw-templates"
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

# Merge env into config (enforced each boot: Vercel gateway, Haiku/Nano, skills, browser)
node << 'EOFNODE'
const fs = require('fs');
const path = require('path');
const configPath = '/root/.openclaw/openclaw.json';
let config = {};
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  console.log('Starting with empty config');
}

config.agents = config.agents || {};
config.agents.defaults = config.agents.defaults || {};
const rawModel = config.agents.defaults.model;
if (rawModel && typeof rawModel === 'object' && !Array.isArray(rawModel)) {
  config.agents.defaults.model = rawModel;
} else if (typeof rawModel === 'string' && rawModel.trim()) {
  config.agents.defaults.model = { primary: rawModel.trim(), fallbacks: [] };
} else {
  config.agents.defaults.model = {};
}
if (
  config.agents.defaults.model.fallbacks &&
  !Array.isArray(config.agents.defaults.model.fallbacks)
) {
  config.agents.defaults.model.fallbacks = [];
}
const rawModels = config.agents.defaults.models;
if (rawModels && typeof rawModels === 'object' && !Array.isArray(rawModels)) {
  config.agents.defaults.models = rawModels;
} else {
  config.agents.defaults.models = {};
}

// Always enable context pruning to limit tool-result bloat in long sessions.
config.agents.defaults.contextPruning = config.agents.defaults.contextPruning || {};
config.agents.defaults.contextPruning.mode = 'cache-ttl';
config.agents.defaults.contextPruning.ttl = '5m';
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

// Vercel AI Gateway: auth profile + model defaults (Haiku primary, GPT-5 Nano fallback)
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
  config.agents.defaults.model.fallbacks = ['vercel-ai-gateway/openai/gpt-5-nano'];
  config.agents.defaults.models['vercel-ai-gateway/anthropic/claude-haiku-4.5'] = { alias: 'Claude Haiku 4.5' };
  config.agents.defaults.models['vercel-ai-gateway/openai/gpt-5-nano'] = { alias: 'GPT-5 Nano' };
  delete config.agents.defaults.models['vercel-ai-gateway/anthropic/claude-sonnet-4.5'];
  delete config.agents.defaults.models['vercel-ai-gateway/anthropic/claude-opus-4.5'];
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
      models: [{ id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5', contextWindow: 200000 }],
    };
    config.agents.defaults.models['anthropic/claude-haiku-4.5'] = { alias: 'Claude Haiku 4.5' };
  }
  if (hasOpenAI) {
    config.models = config.models || {};
    config.models.providers = config.models.providers || {};
    config.models.providers.openai = config.models.providers.openai || {
      api: 'openai-responses',
      models: [{ id: 'gpt-5-nano', name: 'GPT-5 Nano', contextWindow: 128000 }],
    };
    config.agents.defaults.models['openai/gpt-5-nano'] = { alias: 'GPT-5 Nano' };
  }
  if (hasAnthropic) {
    config.agents.defaults.model.primary = 'anthropic/claude-haiku-4.5';
    config.agents.defaults.model.fallbacks = [];
    if (hasOpenAI) {
      config.agents.defaults.model.fallbacks.push('openai/gpt-5-nano');
    }
  } else if (hasOpenAI) {
    config.agents.defaults.model.primary = 'openai/gpt-5-nano';
    config.agents.defaults.model.fallbacks = [];
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
  const dataRoot = '/root/.openclaw';
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

/**
 * Ensure per-agent session storage directories exist under /root/.openclaw.
 * This prevents ENOENT when OpenClaw persists session JSONL files on first write.
 */
function ensureAgentSessionDirs(config) {
  const list = config?.agents?.list;
  if (!Array.isArray(list)) return;

  const agentsRoot = path.join("/root/.openclaw", "agents");
  try {
    fs.mkdirSync(agentsRoot, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Failed to create agents root for session stores:", message);
    return;
  }

  for (const entry of list) {
    const agentIdRaw = entry && typeof entry.id === "string" ? entry.id.trim() : "";
    if (!agentIdRaw) continue;
    if (!/^[A-Za-z0-9_-]+$/.test(agentIdRaw)) {
      console.warn("Skipping session dir bootstrap for invalid agent id:", agentIdRaw);
      continue;
    }
    const sessionDir = path.join(agentsRoot, agentIdRaw, "sessions");
    const sessionsIndex = path.join(sessionDir, "sessions.json");
    try {
      fs.mkdirSync(sessionDir, { recursive: true });
      if (!fs.existsSync(sessionsIndex)) {
        fs.writeFileSync(sessionsIndex, "{}\n");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        "Failed to bootstrap session store for agent:",
        agentIdRaw,
        message,
      );
    }
  }
}

// Merge runtime-generated config if present (profile sync from mission-control runtime).
// We merge list and defaults so existing agents.defaults.model (Vercel/legacy) is preserved; only list and runtime defaults (e.g. skipBootstrap) are taken from generated.
function modelForVercelGateway(model) {
  if (!hasVercelKey || typeof model !== 'string') return model;
  if (model.startsWith('anthropic/') || model.startsWith('openai/')) return 'vercel-ai-gateway/' + model;
  return model;
}
const openclawConfigPath = process.env.OPENCLAW_CONFIG_PATH || '/root/clawd/openclaw.json';
try {
  if (require('fs').existsSync(openclawConfigPath)) {
    const generated = JSON.parse(require('fs').readFileSync(openclawConfigPath, 'utf8'));
    if (generated) {
      if (generated.agents) {
        if (Array.isArray(generated.agents.list)) {
          config.agents.list = generated.agents.list.map(function (entry) {
            var copy = Object.assign({}, entry);
            if (typeof copy.model === 'string') copy.model = modelForVercelGateway(copy.model);
            return copy;
          });
        }
        if (generated.agents.defaults && typeof generated.agents.defaults === 'object') {
          config.agents.defaults = Object.assign({}, config.agents.defaults, generated.agents.defaults);
        }
        console.log('Merged agents from', openclawConfigPath);
      }
      // load (extraDirs) is written by runtime but not accepted by current clawdbot schema; skip to avoid config invalid.
      if (generated.skills && Array.isArray(generated.skills.allowBundled)) {
        config.skills.allowBundled = generated.skills.allowBundled;
        console.log('Merged skills.allowBundled from', openclawConfigPath);
      }
      if (generated.skills && generated.skills.entries && typeof generated.skills.entries === 'object') {
        config.skills.entries = Object.assign(config.skills.entries || {}, generated.skills.entries);
        console.log('Merged skills.entries from', openclawConfigPath);
      }
    }
  }
} catch (e) {
  console.warn('Could not merge OPENCLAW_CONFIG_PATH:', e.message);
}

// Current clawdbot rejects top-level "load"; remove so config is valid.
delete config.load;

ensureAgentSessionDirs(config);

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

# Non-interactive git: never prompt for credentials
export GIT_TERMINAL_PROMPT=0

# Git auth via GH_TOKEN: prefer gh credential helper, fallback to GIT_ASKPASS
GITHUB_TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}"
if [ -n "$GITHUB_TOKEN" ]; then
  if gh auth setup-git --hostname github.com 2>/dev/null; then
    echo "Git credential helper configured (gh auth setup-git)"
  else
    GIT_ASKPASS_SCRIPT="/tmp/git-askpass-$$"
    echo '#!/bin/sh
exec echo "${GIT_ASKPASS_TOKEN}"' > "$GIT_ASKPASS_SCRIPT"
    chmod +x "$GIT_ASKPASS_SCRIPT"
    export GIT_ASKPASS="$GIT_ASKPASS_SCRIPT"
    export GIT_ASKPASS_TOKEN="$GITHUB_TOKEN"
    echo "Git auth using GIT_ASKPASS fallback"
  fi
fi

# Default git identity for commits (overridable via env)
if [ -z "$(git config --global user.name 2>/dev/null)" ]; then
  git config --global user.name "${GIT_AUTHOR_NAME:-OpenClaw Agent}"
fi
if [ -z "$(git config --global user.email 2>/dev/null)" ]; then
  git config --global user.email "${GIT_AUTHOR_EMAIL:-openclaw-agent@users.noreply.github.com}"
fi

WORKSPACE_DIR="/root/clawd"
BOOTSTRAP_FILE="$WORKSPACE_DIR/BOOTSTRAP.md"
WRITABLE_REPO_DIR="$WORKSPACE_DIR/repos/openclaw-mission-control"
REPO_URL="https://github.com/0xGeegZ/openclaw-mission-control.git"

if [ -f "$BOOTSTRAP_FILE" ]; then
  echo "Removing BOOTSTRAP.md to avoid bootstrap mode..."
  rm -f "$BOOTSTRAP_FILE"
fi

mkdir -p \
  "$WORKSPACE_DIR/memory" \
  "$WORKSPACE_DIR/deliverables" \
  "$WORKSPACE_DIR/repos" \
  "$OPENCLAW_WORKSPACE_ROOT"
touch "$WORKSPACE_DIR/MEMORY.md" "$WORKSPACE_DIR/memory/WORKING.md"
DAILY_MEMORY_FILE="$WORKSPACE_DIR/memory/$(date +%F).md"
touch "$DAILY_MEMORY_FILE"

# Clone writable repo from GitHub only (no host mount)
if [ ! -d "$WRITABLE_REPO_DIR/.git" ]; then
  echo "Preparing writable repo at $WRITABLE_REPO_DIR..."
  if ! git clone "$REPO_URL" "$WRITABLE_REPO_DIR"; then
    echo "WARNING: Failed to clone repo. PR creation will be blocked. Check GH_TOKEN and network."
  fi
fi

sync_doc_if_changed() {
  local src="$1"
  local dest="$2"

  if [ -f "$src" ] && { [ ! -f "$dest" ] || ! cmp -s "$src" "$dest"; }; then
    cp "$src" "$dest"
  fi
}

seed_agent_memory_scaffold() {
  local agent_dir="$1"
  local memory_dir="$agent_dir/memory"
  local deliverables_dir="$agent_dir/deliverables"

  mkdir -p "$memory_dir" "$deliverables_dir"

  if [ ! -f "$agent_dir/MEMORY.md" ]; then
    cat > "$agent_dir/MEMORY.md" << 'EOFMEM'
# MEMORY

Stable decisions and key learnings.
EOFMEM
  fi

  if [ ! -f "$memory_dir/WORKING.md" ]; then
    cat > "$memory_dir/WORKING.md" << 'EOFWORK'
# WORKING

What I'm doing right now.
EOFWORK
  fi

  now_epoch="$(date -u +%s)"
  for day_offset in -1 0 1; do
    day_epoch="$((now_epoch + day_offset * 86400))"
    day_file="$(date -u -d "@$day_epoch" +%F)"
    if [ ! -f "$memory_dir/$day_file.md" ]; then
      cat > "$memory_dir/$day_file.md" << 'EOFDAY'
# DAILY NOTES

EOFDAY
    fi
  done
}

# Defensive backfill for existing per-agent workspaces.
for agent_dir in "$OPENCLAW_WORKSPACE_ROOT"/*; do
  [ -d "$agent_dir" ] || continue
  seed_agent_memory_scaffold "$agent_dir"
done

# Sync runtime docs from writable clone into workspace (for agents)
if [ -d "$WRITABLE_REPO_DIR/.git" ]; then
  sync_doc_if_changed "$WRITABLE_REPO_DIR/docs/runtime/HEARTBEAT.md" "$WORKSPACE_DIR/HEARTBEAT.md"
  sync_doc_if_changed "$WRITABLE_REPO_DIR/docs/runtime/AGENTS.md" "$WORKSPACE_DIR/AGENTS.md"
fi

TOKEN="${OPENCLAW_GATEWAY_TOKEN:-}"
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
  --user-data-dir=/root/.openclaw/browser/clawd/user-data \
  about:blank 2>/dev/null &
CHROMIUM_PID=$!
sleep 2
if kill -0 $CHROMIUM_PID 2>/dev/null; then
  echo "Chromium started (PID $CHROMIUM_PID)"
else
  echo "WARNING: Chromium failed to start. Browser automation may be unavailable."
fi

if [ -n "$TOKEN" ]; then
  "$CLI_BIN" gateway --port 18789 --verbose --allow-unconfigured --bind lan --token "$TOKEN" &
else
  "$CLI_BIN" gateway --port 18789 --verbose --allow-unconfigured --bind local &
fi
GATEWAY_PID=$!

# Optional: when OPENCLAW_CONFIG_RELOAD=1, watch runtime-generated config and restart gateway on change
if [ -n "${OPENCLAW_CONFIG_RELOAD:-}" ] && [ "${OPENCLAW_CONFIG_RELOAD}" = "1" ]; then
  (
    # Set baseline mtime so only changes after startup trigger a restart
    LAST_MTIME=""
    if [ -f "$OPENCLAW_CONFIG_PATH" ]; then
      LAST_MTIME=$(stat -c %Y "$OPENCLAW_CONFIG_PATH" 2>/dev/null || stat -f %m "$OPENCLAW_CONFIG_PATH" 2>/dev/null)
    fi
    while kill -0 "$GATEWAY_PID" 2>/dev/null; do
      sleep 30
      if [ -f "$OPENCLAW_CONFIG_PATH" ]; then
        MTIME=$(stat -c %Y "$OPENCLAW_CONFIG_PATH" 2>/dev/null || stat -f %m "$OPENCLAW_CONFIG_PATH" 2>/dev/null)
        if [ -n "$MTIME" ] && [ -n "$LAST_MTIME" ] && [ "$MTIME" != "$LAST_MTIME" ]; then
          echo "OpenClaw config changed, restarting gateway..."
          kill "$GATEWAY_PID" 2>/dev/null || true
          exit 0
        fi
        LAST_MTIME="$MTIME"
      fi
    done
  ) &
  WATCHER_PID=$!
  trap 'kill $GATEWAY_PID $CHROMIUM_PID $WATCHER_PID 2>/dev/null; wait' SIGTERM SIGINT
else
  trap 'kill $GATEWAY_PID $CHROMIUM_PID 2>/dev/null; wait' SIGTERM SIGINT
fi

wait $GATEWAY_PID
EXIT_CODE=$?
kill $CHROMIUM_PID 2>/dev/null
[ -n "${WATCHER_PID:-}" ] && kill "$WATCHER_PID" 2>/dev/null
exit $EXIT_CODE
