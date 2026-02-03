# Runtime Docker Compose (Local Dev)

This guide covers running the Mission Control runtime (and optional OpenClaw gateway) locally with Docker Compose. Target is **local development only**; production deployment uses per-account infrastructure (e.g. DigitalOcean Droplets) and is documented elsewhere.

## Prerequisites

- Docker and Docker Compose (Docker Desktop includes both).
- Convex deployment with the Mission Control backend and a **service token** scoped to one account.
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

   Health: `curl -s http://127.0.0.1:3001/health`

3. **Start runtime + OpenClaw gateway**

   ```bash
   cd apps/runtime
   npm run docker:up:openclaw
   ```

   - Runtime health: `curl -s http://127.0.0.1:3001/health`
  - OpenClaw Control UI: http://localhost:18789/ (or `?token=...` if set)

  Set `OPENCLAW_GATEWAY_URL=http://openclaw-gateway:18789` in `apps/runtime/.env` so the runtime can send messages to agent sessions via the OpenResponses HTTP endpoint (`POST /v1/responses`). The gateway template and start script enable this endpoint on every boot. Agent responses from OpenClaw are **written back** to the Mission Control task thread (shared brain) for notification-triggered runs (mentions, assignments, thread updates). Set `VERCEL_AI_GATEWAY_API_KEY` for the gateway (mapped to `AI_GATEWAY_API_KEY` internally). Skills are enabled by default; Chromium is installed in the gateway image for web tools.

If you prefer, you can still run Compose directly:

```bash
docker compose -f apps/runtime/docker-compose.runtime.yml up --build
docker compose -f apps/runtime/docker-compose.runtime.yml --profile openclaw up --build
```

## Compose file

- **File**: `apps/runtime/docker-compose.runtime.yml`.
- **Services**:
  - `runtime` — Mission Control runtime service (health on port 3001).
  - `openclaw-gateway` — OpenClaw (Clawdbot) gateway; started only with profile `openclaw`.

Ports are bound to `127.0.0.1` by default so only the host can access them. Do not expose these ports publicly without setting gateway token and hardening (see OpenClaw docs).

## Environment variables

See `apps/runtime/.env.example`. Summary:

| Variable | Required | Description |
|----------|----------|-------------|
| `ACCOUNT_ID` | Yes | Convex account ID this runtime serves. |
| `CONVEX_URL` | Yes | Convex deployment URL. |
| `SERVICE_TOKEN` | Yes | Convex service token (account-scoped). |
| `HEALTH_HOST` | No | Bind address for health server; use `0.0.0.0` in Docker so healthcheck works. |
| `LOG_LEVEL` | No | `debug` \| `info` \| `warn` \| `error` (default `info`). |
| `AGENT_SYNC_INTERVAL` | No | Agent list sync interval in ms; new agents picked up without restart (default `60000`). |
| `OPENCLAW_GATEWAY_URL` | No | OpenClaw gateway base URL for sending messages to sessions. Default `http://127.0.0.1:18789`; with profile `openclaw` set `http://openclaw-gateway:18789` so the runtime can reach the gateway. |
| `OPENCLAW_GATEWAY_TOKEN` | No | Gateway Bearer token. Optional for local gateway URLs; required for non-local URLs. If empty, the gateway binds to localhost only. |
| `OPENCLAW_REQUEST_TIMEOUT_MS` | No | Timeout for `/v1/responses` requests in ms (default `60000`). Agent replies are written back to task threads; increase if agent runs are long. |
| `AI_GATEWAY_API_KEY` | For OpenClaw | Vercel AI Gateway API key used by OpenClaw (optional). If unset, `VERCEL_AI_GATEWAY_API_KEY` is used. |
| `VERCEL_AI_GATEWAY_API_KEY` | For OpenClaw | Vercel AI Gateway API key; mapped to `AI_GATEWAY_API_KEY`. |

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

- `.runtime/openclaw-data` → OpenClaw config and state (persists across restarts).
- `.runtime/openclaw-workspace` → Agent workspace (persists across restarts).

These directories are created on first run and are gitignored (`.runtime/`). To reset OpenClaw state, remove `.runtime/openclaw-data` and `.runtime/openclaw-workspace` and restart.

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
  Change `HEALTH_PORT` (runtime) or the host port mapping in `apps/runtime/docker-compose.runtime.yml` (e.g. `"127.0.0.1:3002:3001"`). For OpenClaw, change the published port (e.g. `"127.0.0.1:18790:18789"`).

## Further reading

- [apps/runtime/README.md](../../apps/runtime/README.md) — Runtime service overview and env reference.
- [docs/roadmap/runtime-version-management-v2.md](../roadmap/runtime-version-management-v2.md) — Fleet upgrade and version management.
- [CrocSwap/clawdbot-docker](https://github.com/CrocSwap/clawdbot-docker) — Upstream OpenClaw Docker patterns.
