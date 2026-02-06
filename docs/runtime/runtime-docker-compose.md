# Runtime Docker Compose (Local Dev)

This guide covers running the OpenClaw Mission Control runtime (and optional OpenClaw gateway) locally with Docker Compose. Target is **local development only**; production deployment uses per-account infrastructure (e.g. DigitalOcean Droplets) and is documented elsewhere.

## Prerequisites

- Docker and Docker Compose (Docker Desktop includes both).
- Convex deployment with the OpenClaw Mission Control backend and a **service token** scoped to one account.
- For OpenClaw gateway: **Vercel AI Gateway** API key (`VERCEL_AI_GATEWAY_API_KEY`); or Anthropic/OpenAI keys for legacy provider.

## Quick start

1. **Clone and configure**

   From the repo root:

   ```bash
   cp apps/runtime/.env.example apps/runtime/.env
   ```

   Edit `apps/runtime/.env` and set:
   - `ACCOUNT_ID` — Convex `accounts` document ID this runtime serves.
   - `CONVEX_URL` — Your Convex deployment URL (e.g. `https://xxx.convex.cloud`).
   - `SERVICE_TOKEN` — Service token for Convex (account-scoped).

   Optional for runtime-only: `HEALTH_HOST=0.0.0.0` so the healthcheck inside the container can reach the server.

2. **Start runtime only**

   ```bash
   cd apps/runtime
   npm run docker:up
   ```

   Health: `curl -s http://127.0.0.1:3000/health`

3. **Start runtime + OpenClaw gateway**

   ```bash
   cd apps/runtime
   npm run docker:up:openclaw
   ```

   - Runtime health: `curl -s http://127.0.0.1:3000/health`

- OpenClaw Control UI: <http://localhost:18789/> (or `?token=...` if set)

Set `OPENCLAW_GATEWAY_URL=http://openclaw-gateway:18789` in `apps/runtime/.env` so the runtime can send messages to agent sessions via the OpenResponses HTTP endpoint (`POST /v1/responses`). The gateway template and start script enable this endpoint on every boot. Agent responses from OpenClaw are **written back** to the OpenClaw Mission Control task thread (shared brain) for notification-triggered runs (mentions, assignments, thread updates). Set `VERCEL_AI_GATEWAY_API_KEY` for the gateway (mapped to `AI_GATEWAY_API_KEY` internally). Skills are enabled by default; Chromium is installed in the gateway image for web tools.

If you prefer, you can still run Compose directly:

```bash
docker compose -f apps/runtime/docker-compose.runtime.yml up --build
docker compose -f apps/runtime/docker-compose.runtime.yml --profile openclaw up --build
```

## Compose file

- **File**: `apps/runtime/docker-compose.runtime.yml`.
- **Services**:
  - `runtime` — OpenClaw Mission Control runtime service (health on port 3000).
  - `openclaw-gateway` — OpenClaw (Clawdbot) gateway; started only with profile `openclaw`.

Ports are bound to `127.0.0.1` by default so only the host can access them. Do not expose these ports publicly without setting gateway token and hardening (see OpenClaw docs).

## Environment variables

See `apps/runtime/.env.example`. Summary:

| Variable                          | Required     | Description                                                                                                                                                                                          |
| --------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ACCOUNT_ID`                      | Yes          | Convex account ID this runtime serves.                                                                                                                                                               |
| `CONVEX_URL`                      | Yes          | Convex deployment URL.                                                                                                                                                                               |
| `SERVICE_TOKEN`                   | Yes          | Convex service token (account-scoped).                                                                                                                                                               |
| `HEALTH_HOST`                     | No           | Bind address for health server; use `0.0.0.0` in Docker so healthcheck works.                                                                                                                        |
| `TASK_STATUS_BASE_URL`            | No           | Base URL the OpenClaw gateway can use to reach runtime HTTP fallback endpoints (defaults to `http://{HEALTH_HOST}:{HEALTH_PORT}`).                                                                   |
| `LOG_LEVEL`                       | No           | `debug` \| `info` \| `warn` \| `error` (default `info`).                                                                                                                                             |
| `AGENT_SYNC_INTERVAL`             | No           | Agent list sync interval in ms; new agents picked up without restart (default `60000`).                                                                                                              |
| `OPENCLAW_GATEWAY_URL`            | No           | OpenClaw gateway base URL for sending messages to sessions. Default `http://127.0.0.1:18789`; with profile `openclaw` set `http://openclaw-gateway:18789` so the runtime can reach the gateway.      |
| `OPENCLAW_GATEWAY_TOKEN`          | No           | Gateway Bearer token. Optional for local gateway URLs; required for non-local URLs. If empty, the gateway binds to localhost only.                                                                   |
| `OPENCLAW_REQUEST_TIMEOUT_MS`     | No           | Timeout for `/v1/responses` requests in ms (default `180000`). Agent replies are written back to task threads; increase if agent runs are long.                                                      |
| `OPENCLAW_WORKSPACE_ROOT`         | No           | Root directory for per-agent OpenClaw workspaces (default `/root/clawd/agents`). Runtime writes SOUL.md, TOOLS.md, AGENTS.md here. Must be writable and shared with gateway when using profile sync. |
| `OPENCLAW_CONFIG_PATH`            | No           | Path to generated `openclaw.json` (default `/root/clawd/openclaw.json`). Gateway merges `agents`, `load` (extraDirs), and `skills.entries` from this file at startup.                                |
| `OPENCLAW_AGENTS_MD_PATH`         | No           | Optional path to AGENTS.md to copy into each agent workspace; unset uses embedded default.                                                                                                           |
| `OPENCLAW_HEARTBEAT_MD_PATH`      | No           | Optional path to HEARTBEAT.md to copy into each agent workspace; defaults to `/root/clawd/HEARTBEAT.md`.                                                                                             |
| `OPENCLAW_PROFILE_SYNC`           | No           | Set to `false` to disable profile sync (workspaces and openclaw.json); default is enabled.                                                                                                           |
| `OPENCLAW_CONFIG_RELOAD`          | No           | Gateway only: set to `1` to watch runtime-generated config and restart gateway when it changes (default: off).                                                                                       |
| `OPENCLAW_SESSION_RETENTION_DAYS` | No           | Optional OpenClaw session store prune on gateway start. Set a number of days to remove stale session entries; set `0` to clear all entries.                                                          |
| `AI_GATEWAY_API_KEY`              | For OpenClaw | Vercel AI Gateway API key used by OpenClaw (optional). If unset, `VERCEL_AI_GATEWAY_API_KEY` is used.                                                                                                |
| `VERCEL_AI_GATEWAY_API_KEY`       | For OpenClaw | Vercel AI Gateway API key; mapped to `AI_GATEWAY_API_KEY`.                                                                                                                                           |

## Upgrade workflow (local)

To pull new images and restart the stack (aligned with [runtime-version-management-v2.md](../roadmap/runtime-version-management-v2.md)):

```bash
./scripts/runtime-upgrade-local.sh
```

With OpenClaw profile:

```bash
PROFILE=openclaw ./scripts/runtime-upgrade-local.sh
```

## BuildKit note

The runtime Docker scripts default to `DOCKER_BUILDKIT=0` to avoid known Docker Desktop snapshotter issues on macOS. If you prefer BuildKit, set `DOCKER_BUILDKIT=1` and `COMPOSE_DOCKER_CLI_BUILD=1` in your shell before running the scripts.

The script runs `docker compose pull`, `down`, then `up -d` from the repo root.

## Volumes (OpenClaw)

When using profile `openclaw`, Compose mounts:

- `.runtime/openclaw-data` → OpenClaw config and state (mounted at `/root/.openclaw`, persists across restarts).
- `.runtime/openclaw-workspace` → Agent workspace (persists across restarts).

**Both** the `runtime` and `openclaw-gateway` services mount `.runtime/openclaw-workspace` at `/root/clawd`. The runtime writes per-agent workspaces (SOUL.md, TOOLS.md, AGENTS.md, HEARTBEAT.md, memory/) and a generated `openclaw.json` there; the gateway reads that config and uses the agent list. This **profile sync** keeps OpenClaw sessions aligned with Convex agent profiles (role, skills, soul content) without manual steps. Skills can optionally store a SKILL.md body (`contentMarkdown`) in Convex; the runtime materializes them under each agent's `skills/<slug>/` and adds those paths to the generated config so OpenClaw can load them.

These directories are created on first run and are gitignored (`.runtime/`). To reset OpenClaw state, remove `.runtime/openclaw-data` and `.runtime/openclaw-workspace` and restart.

**Stale workspaces:** When an agent is removed from the account, the runtime stops syncing it and the generated `openclaw.json` no longer lists that agent. The agent's workspace directory under `.runtime/openclaw-workspace/agents/<slug>` is not deleted automatically. For a full cleanup, remove the `agents` directory (or specific `<slug>` subdirs) and restart, or leave it; new syncs will not use removed agents.

If you only need to trim the session list shown at `/sessions`, set `OPENCLAW_SESSION_RETENTION_DAYS` (or `0` to clear) in `apps/runtime/.env` and restart the gateway; this prunes `sessions.json` entries but keeps transcripts/workspace intact.

## Troubleshooting

- **Runtime exits on startup**  
  Ensure `ACCOUNT_ID`, `CONVEX_URL`, and `SERVICE_TOKEN` are set in `apps/runtime/.env`. The process exits with an error if any are missing.

- **Healthcheck fails in Docker**  
  Set `HEALTH_HOST=0.0.0.0` in `apps/runtime/.env` so the health server listens on all interfaces inside the container. The Compose file already passes `HEALTH_HOST=0.0.0.0` for the runtime service.

- **Containerd snapshotter errors on macOS**  
  If you see errors like `containerd-stargz-grpc/snapshotter` during builds, restart Docker Desktop and retry. If it persists, disable "Use containerd for pulling and storing images" in Docker Desktop > Settings > Features in development.

- **OpenClaw gateway not starting**  
  Check logs: `docker compose -f apps/runtime/docker-compose.runtime.yml --profile openclaw logs openclaw-gateway`. Set `VERCEL_AI_GATEWAY_API_KEY` (or `ANTHROPIC_API_KEY`) for agents to run. The gateway may still start without it for the Control UI.

- **Port already in use**  
  Change `HEALTH_PORT` (runtime) or the host port mapping in `apps/runtime/docker-compose.runtime.yml` (e.g. `"127.0.0.1:3002:3000"`). For OpenClaw, change the published port (e.g. `"127.0.0.1:18790:18789"`).

- **Task status: "tool not available" or "HTTP endpoint not accessible"**  
  The agent can update task status via the **task_status** tool (when client tools are enabled) or the **HTTP fallback** (POST to runtime health server).
  1. **Tool**: The runtime sends `tools: [{ type: "function", function: { name, description, parameters } }]` per [OpenResponses API](https://docs.clawd.bot/gateway/openresponses-http-api). Ensure the OpenClaw gateway version supports client-side function tools and forwards the `tools` parameter to the model. Set `LOG_LEVEL=debug` in the runtime and confirm logs show "Sending with tools" for task notifications. If the tool still does not appear in the agent UI, set `OPENCLAW_CLIENT_TOOLS_ENABLED=false` to force HTTP fallbacks, or upgrade the gateway to a version that supports the Tools (client-side function tools) contract.
  2. **HTTP fallback**: The agent must be able to reach the runtime at `TASK_STATUS_BASE_URL` (e.g. `http://runtime:3000`). With profile `openclaw`, both services use the same Docker network; from the gateway container, verify: `docker compose -f apps/runtime/docker-compose.runtime.yml --profile openclaw exec openclaw-gateway curl -s http://runtime:3000/health`. If that fails, runtime and gateway are not on the same network or the runtime is not running. Ensure you start both with the same compose file and profile: `docker compose -f apps/runtime/docker-compose.runtime.yml --profile openclaw up --build`.

## Further reading

- [apps/runtime/README.md](../../apps/runtime/README.md) — Runtime service overview and env reference.
- [docs/roadmap/runtime-version-management-v2.md](../roadmap/runtime-version-management-v2.md) — Fleet upgrade and version management.
- [CrocSwap/clawdbot-docker](https://github.com/CrocSwap/clawdbot-docker) — Upstream OpenClaw Docker patterns.
