# Mission Control — Runtime Service

Per-account Node.js service that runs the **OpenClaw (Clawdbot) agent runtime** for a single Mission Control account. One runtime server per customer account; typically deployed on a DigitalOcean Droplet.

## Role in Mission Control

Mission Control is a multi-agent coordination SaaS. The runtime is the **agent execution layer**:

- **Web app** → Dashboard (Kanban, threads, feed); users and Convex client auth.
- **Convex** → Shared brain (tasks, agents, messages, notifications, activities).
- **Runtime** → This service: OpenClaw gateway, notification delivery, heartbeats, health reporting.

The runtime:

1. Connects to Convex with a **service token** scoped to one `accountId`.
2. Starts the **OpenClaw gateway** and registers agent sessions (session keys like `agent:{slug}:{accountId}`).
3. **Delivery loop**: polls Convex for undelivered agent notifications (mentions, subscriptions, assignments), then sends them to the correct OpenClaw session.
4. **Heartbeat scheduler**: wakes each agent on its schedule to check for work and report status.
5. **Health server**: exposes `/health` and `/version`, and periodically reports status (and versions) to Convex.

See [docs/mission-control-initial-article.md](../../docs/mission-control-initial-article.md) and [docs/mission-control-cursor-core-instructions.md](../../docs/mission-control-cursor-core-instructions.md) for full context.

## Prerequisites

- **Node 24** (use `nvm use 24` or match repo `.nvmrc`).
- **Convex deployment** with the Mission Control backend (schema, service actions).
- **OpenClaw (Clawdbot)** installed and on `PATH` for session/gateway support (optional for local dev; version is detected at startup).
- **Service token** for the Convex backend, scoped to the account this runtime serves.

## Environment variables

Copy [.env.example](./.env.example) to `.env` and set:

| Variable | Required | Description |
|----------|----------|-------------|
| `ACCOUNT_ID` | Yes | Convex `accounts` document ID this runtime serves. |
| `CONVEX_URL` | Yes | Convex deployment URL (e.g. `https://xxx.convex.cloud`). |
| `SERVICE_TOKEN` | Yes | Token for Convex service-only actions (account-scoped). |
| `HEALTH_PORT` | No | HTTP port for health server (default `3001`). |
| `DELIVERY_INTERVAL` | No | Notification poll interval in ms (default `5000`). |
| `HEALTH_CHECK_INTERVAL` | No | Convex status report interval in ms (default `60000`). |
| `RUNTIME_VERSION` | No | Override version (default: `package.json` version). |
| `OPENCLAW_VERSION` | No | Override if `openclaw --version` fails. |
| `DROPLET_ID`, `DROPLET_IP`, `DROPLET_REGION` | No | Infrastructure identifiers (reported in health and Convex). |

## Running locally

From repo root or from `apps/runtime`:

```bash
# Development (watch mode)
npm run dev

# Build and run
npm run build
npm start
```

Ensure `.env` is set; the process will exit on startup if `ACCOUNT_ID`, `CONVEX_URL`, or `SERVICE_TOKEN` are missing.

## Docker

The Dockerfile expects to be built from the **monorepo root** (it copies `apps/runtime`, `packages/shared`, `packages/backend`). Example from repo root:

```bash
docker build -f apps/runtime/Dockerfile -t mission-control-runtime .
docker run --env-file apps/runtime/.env -p 3001:3001 mission-control-runtime
```

Pass env vars via `--env-file` or `-e`; the app does not read `.env` from disk inside the image unless you mount it.

## Health endpoints

- **`GET /health`** — Full status: gateway/delivery state, versions, infrastructure, uptime, delivery counts.
- **`GET /version`** — Lightweight: runtime version, OpenClaw version, droplet id/region.

Both return JSON. Default port: `3001`.

## Graceful shutdown

On `SIGTERM` or `SIGINT`, the runtime:

1. Stops the delivery loop and heartbeat scheduler.
2. Shuts down the OpenClaw gateway.
3. Stops the health server.
4. Calls Convex to set the account runtime status to `offline`.
5. Exits.

## Project layout

```
apps/runtime/
├── src/
│   ├── index.ts      # Entry point; starts gateway, delivery, heartbeat, health
│   ├── config.ts     # Env-based config and OpenClaw version detection
│   ├── convex-client.ts  # Convex client for service actions
│   ├── gateway.ts    # OpenClaw gateway and session registration
│   ├── delivery.ts   # Notification delivery loop
│   ├── heartbeat.ts  # Per-agent heartbeat scheduler
│   └── health.ts     # HTTP health server and Convex status updates
├── Dockerfile
├── .env.example
└── README.md
```

## Further reading

- [docs/build/00-orchestrator.md](../../docs/build/00-orchestrator.md) — Build phases and module 13 (runtime service).
- [docs/mission-control-cursor-core-instructions.md](../../docs/mission-control-cursor-core-instructions.md) — Data flows, service auth, invariants.
