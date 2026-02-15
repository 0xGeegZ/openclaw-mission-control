# LobsterControl — Runtime Service

Per-account Node.js service that runs the **OpenClaw (Clawdbot) agent runtime** for a single LobsterControl account. One runtime server per customer account; typically deployed on a DigitalOcean Droplet.

## Role in LobsterControl

LobsterControl is a multi-agent coordination SaaS. The runtime is the **agent execution layer**:

- **Web app** → Dashboard (Kanban, threads, feed); users and Convex client auth.
- **Convex** → Shared brain (tasks, agents, messages, notifications, activities).
- **Runtime** → This service: OpenClaw gateway, notification delivery, heartbeats, health reporting.

The runtime:

1. Connects to Convex with a **service token** scoped to one `accountId`.
2. Starts the **OpenClaw gateway** and registers agent sessions (session keys like `agent:{slug}:{accountId}`).
3. **Delivery loop**: polls Convex for undelivered agent notifications (mentions, subscriptions, assignments), then sends them to the correct OpenClaw session via the OpenResponses HTTP API (`POST {OPENCLAW_GATEWAY_URL}/v1/responses` with `x-openclaw-session-key`). Agent replies are **written back** to the task thread in Convex so they appear in the LobsterControl web app. The gateway HTTP endpoint must be enabled in OpenClaw config.
4. **Heartbeat scheduler**: wakes each agent on its schedule to check for work and report status.
5. **Agent sync**: periodically fetches the agent list from Convex so new agents go online without restarting the runtime.
6. **Health server**: exposes `/health` and `/version`, and periodically reports status (and versions) to Convex.

See [docs/concept/lobster-control-initial-article.md](../../docs/concept/lobster-control-initial-article.md) and [docs/concept/lobster-control-cursor-core-instructions.md](../../docs/concept/lobster-control-cursor-core-instructions.md) for full context.

## Prerequisites

- **Node 24** (use `nvm use 24` or match repo `.nvmrc`).
- **Convex deployment** with the LobsterControl backend (schema, service actions).
- **OpenClaw (Clawdbot)** installed and on `PATH` for session/gateway support (optional for local dev; version is detected at startup).
- **Service token** for the Convex backend, scoped to the account this runtime serves.

## Environment variables

Copy [.env.example](./.env.example) to `.env` and set:

| Variable                                              | Required | Description                                                                                                                                                                                                                            |
| ----------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ACCOUNT_ID`                                          | Yes      | Convex `accounts` document ID this runtime serves.                                                                                                                                                                                     |
| `CONVEX_URL`                                          | Yes      | Convex deployment URL (e.g. `https://xxx.convex.cloud`).                                                                                                                                                                               |
| `SERVICE_TOKEN`                                       | Yes      | Token for Convex service-only actions (account-scoped).                                                                                                                                                                                |
| `HEALTH_PORT`                                         | No       | HTTP port for health server (default `3000`).                                                                                                                                                                                          |
| `DELIVERY_INTERVAL`                                   | No       | Notification poll interval in ms (default `15000`).                                                                                                                                                                                    |
| `HEALTH_CHECK_INTERVAL`                               | No       | Convex status report interval in ms (default `300000`).                                                                                                                                                                                |
| `AGENT_SYNC_INTERVAL`                                 | No       | Agent list sync interval in ms; new agents picked up without restart (default `300000`).                                                                                                                                               |
| `RUNTIME_VERSION`                                     | No       | Override version (default: `package.json` version).                                                                                                                                                                                    |
| `OPENCLAW_VERSION`                                    | No       | Override if `openclaw --version` fails.                                                                                                                                                                                                |
| `LOG_LEVEL`                                           | No       | `debug` \| `info` \| `warn` \| `error` (default `info`).                                                                                                                                                                               |
| `HEALTH_HOST`                                         | No       | Bind address for health server (default `127.0.0.1`; use `0.0.0.0` in Docker).                                                                                                                                                         |
| `TASK_STATUS_BASE_URL`                                | No       | Base URL the OpenClaw gateway can use to reach runtime HTTP fallback endpoints (defaults to `http://{HEALTH_HOST}:{HEALTH_PORT}`).                                                                                                     |
| `DELIVERY_BACKOFF_BASE_MS`, `DELIVERY_BACKOFF_MAX_MS` | No       | Backoff on delivery poll errors (defaults `5000`, `300000`).                                                                                                                                                                           |
| `OPENCLAW_GATEWAY_URL`                                | No       | OpenClaw gateway base URL for OpenResponses (`POST /v1/responses`). Default `http://127.0.0.1:18789`; in Docker with profile `openclaw` use `http://openclaw-gateway:18789`. Empty = disabled (send will fail with descriptive error). |
| `OPENCLAW_GATEWAY_TOKEN`                              | No       | Gateway Bearer token. Optional for local gateway URLs; required for non-local URLs. If empty, the gateway binds to localhost only.                                                                                                     |
| `OPENCLAW_REQUEST_TIMEOUT_MS`                         | No       | Timeout for `/v1/responses` requests in ms (default `300000`). Clamped to 5000–600000; invalid values are adjusted and a warning is logged.                                                                                           |
| `OPENCLAW_WORKSPACE_ROOT`                             | No       | Root directory for per-agent workspaces (default `/root/clawd/agents`). Runtime writes `SOUL.md`, `TOOLS.md`, `AGENTS.md`, `HEARTBEAT.md` when profile sync is enabled. Set `OPENCLAW_PROFILE_SYNC=true` to populate these workspace files. |
| `OPENCLAW_CONFIG_PATH`                                | No       | Path to generated `openclaw.json` (default `/root/clawd/openclaw.json`).                                                                                                                                                               |
| `OPENCLAW_AGENTS_MD_PATH`                             | No       | Optional path to `AGENTS.md` to copy into each agent workspace; unset uses embedded default.                                                                                                                                           |
| `OPENCLAW_HEARTBEAT_MD_PATH`                          | No       | Optional path to `HEARTBEAT.md` to copy into each agent workspace; defaults to `/root/clawd/HEARTBEAT.md`.                                                                                                                             |
| `OPENCLAW_PROFILE_SYNC`                               | No       | Set to `true` to enable profile sync (workspaces and openclaw.json); default is disabled.                                                                                                                                              |
| `OPENCLAW_CLIENT_TOOLS_ENABLED`                       | No       | When `false`, disable client-side tools and rely on HTTP fallbacks.                                                                                                                                                                    |
| `OPENCLAW_SESSION_RETENTION_DAYS`                     | No       | Optional OpenClaw session store prune on gateway start. Set a number of days to remove stale session entries; set `0` to clear all entries.                                                                                            |
| `AI_GATEWAY_API_KEY`                                  | No       | Vercel AI Gateway key used by OpenClaw (optional). If unset, `VERCEL_AI_GATEWAY_API_KEY` is used.                                                                                                                                      |
| `DROPLET_ID`, `DROPLET_IP`, `DROPLET_REGION`          | No       | Infrastructure identifiers (reported in health and Convex).                                                                                                                                                                            |

### Applying updates to agent prompts (AGENTS.md, HEARTBEAT.md)

Agents read AGENTS.md and HEARTBEAT.md from their workspace. To ensure **current** agents use updated wording (e.g. “only push code for the current task”, “skill usage is mandatory for relevant operations”):

1. **Restart the runtime** so profile sync runs again. Sync writes the current AGENTS.md and HEARTBEAT.md into each agent’s workspace; OpenClaw then uses those files on the next run.

2. **Where does the content come from?**
   - **If you set file paths:** Set `OPENCLAW_AGENTS_MD_PATH` and/or `OPENCLAW_HEARTBEAT_MD_PATH` to the repo files (e.g. mount the repo in Docker and use `/path/in/container/docs/runtime/AGENTS.md`). After updating the docs and restarting the runtime, agents get the new content on next sync.
   - **If you do not set paths:** The runtime uses embedded defaults in code. After a code change that updates those defaults (or a new runtime image deploy), restart the runtime so sync rewrites the workspace files.

3. **Optional:** Re-run seed so the Convex reference document “AGENTS.md — Operating Manual” stays in sync for the dashboard; agents themselves are driven by the runtime workspace files, not by that document.

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
docker build -f apps/runtime/Dockerfile -t lobster-control-runtime .
docker run --env-file apps/runtime/.env -p 3000:3000 lobster-control-runtime
```

Pass env vars via `--env-file` or `-e`; the app does not read `.env` from disk inside the image unless you mount it.

### Docker Compose (local dev)

Use the runtime npm scripts (recommended) to run the runtime (and optionally the OpenClaw gateway). See [docs/runtime/runtime-docker-compose.md](../../docs/runtime/runtime-docker-compose.md) for full instructions.

```bash
# Runtime only (from apps/runtime)
npm run docker:up

# Runtime + OpenClaw gateway (Control UI at http://localhost:18789/ or ?token=... if set)
npm run docker:up:openclaw
```

For the gateway, set `VERCEL_AI_GATEWAY_API_KEY` in `.env` (mapped to `AI_GATEWAY_API_KEY` internally). Skills are enabled by default; the gateway image includes Chromium for web tools.

If you prefer direct Compose commands, run them from the repo root:

```bash
docker compose -f apps/runtime/docker-compose.runtime.yml up --build
docker compose -f apps/runtime/docker-compose.runtime.yml --profile openclaw up --build
```

Upgrade workflow (pull new images and restart):

```bash
./scripts/runtime-upgrade-local.sh
# With OpenClaw: PROFILE=openclaw ./scripts/runtime-upgrade-local.sh
```

## Health endpoints

- **`GET /health`** — Full status: gateway/delivery state, versions, infrastructure, uptime, delivery counts (including `consecutiveFailures`, `lastErrorAt`, `lastErrorMessage` on errors).
- **`GET /version`** — Lightweight: runtime version, OpenClaw version, droplet id/region.

Both return JSON. Default port: `3000`.

## Agent HTTP endpoints (fallback)

These endpoints are **local-only** (loopback) and require the header `x-openclaw-session-key`. They are used as HTTP fallbacks when client-side tools are disabled or unavailable.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/agent/task-status` | POST | Update task status. Response includes `status`, `requestedStatus`, `changed`, `updatedAt`. |
| `/agent/task-create` | POST | Create a task. Returns `taskId`. |
| `/agent/task-assign` | POST | Assign agents to a task (orchestrator-only). |
| `/agent/response-request` | POST | Request a response from other agents. |
| `/agent/document` | POST | Create or update a document. |
| `/agent/task-message` | POST | Post a message to another task (orchestrator-only). |
| `/agent/task-list` | POST | List tasks (orchestrator-only). |
| `/agent/task-get` | POST | Fetch task details (orchestrator-only). |
| `/agent/task-thread` | POST | Fetch task thread messages (most recent, returned oldest-to-newest). |
| `/agent/task-search` | POST | Search tasks (orchestrator-only). |
| `/agent/task-load` | POST | Load task + thread in one call. |
| `/agent/get-agent-skills` | POST | Fetch skills for one or all agents. |
| `/agent/task-delete` | POST | Archive/delete a task (orchestrator-only). |
| `/agent/task-link-pr` | POST | Link a task to a GitHub PR (orchestrator-only). |

### Tools and session key

The runtime sends per-request tools (task_status, task_create, document_upsert) in the same POST body as the notification message. It also sends **session routing** so the gateway uses the correct session: the `x-openclaw-session-key` header and the OpenResponses `user` field (set to the same session key). Per [OpenResponses API](https://docs.clawd.bot/gateway/openresponses-http-api), the endpoint is stateless by default and generates a new session each call unless the request provides a stable session (e.g. via `user` or the advanced `x-openclaw-session-key` header). If the gateway still runs under a different session (e.g. `openresponses:uuid`), the model will not receive our tools and will report "tool not in function set". When debugging, check gateway logs to confirm the run uses the session key the runtime sent.

### Troubleshooting

- **"task_status tool not found in function set"** — (1) **Session routing**: The runtime sends `x-openclaw-session-key`, `user: sessionKey` in the body, and `tools`. If gateway logs still show `session=openresponses:...` or `agent=main`, the gateway is running in a different session and per-request tools are not applied. The OpenResponses API is [stateless by default](https://docs.clawd.bot/gateway/openresponses-http-api#session-behavior); the `user` field (and header) tell it which session to use. Ensure your OpenClaw (Clawdbot) gateway version honors `user` and/or `x-openclaw-session-key` for session routing. If the problem persists, check the gateway version and the "Session behavior" / "Choosing an agent" sections of the [OpenResponses API](https://docs.clawd.bot/gateway/openresponses-http-api) docs. (2) **Schema compatibility**: Some OpenClaw/Cloud Code Assist backends accept only a strict subset of JSON Schema; avoid unsupported keywords (e.g. `anyOf`/`oneOf`/`allOf`, `patternProperties`, `additionalProperties`, `minLength`/`maxLength`, `format`). If the gateway returns a 400 "invalid tool schema", check OpenClaw troubleshooting for tool schema compatibility.
- **Works for one agent, fails for another** — Same root cause as above. The runtime sends the same header and tools to every agent; the run that **succeeds** (e.g. Squad Lead moving to REVIEW, or Engineer moving to REVIEW) was executed in the session that matches `x-openclaw-session-key`, so it received the tools. The run that **fails** (e.g. QA or another agent reporting "tool not in function set") was executed in a different session (e.g. `openresponses:...`), so it did not. It is not that one agent has tools and another does not—it is that the gateway sometimes routes the request to the correct session and sometimes to another. Check gateway logs per run: the session key in the log should match the one the runtime sent for that agent.
- **"HTTP endpoint (127.0.0.1:3000) connection refused"** / **"HTTP fallback unreachable"** — The prompt embeds a task-status fallback URL from the runtime’s `taskStatusBaseUrl`. The **agent runs inside the gateway process/container**, so `127.0.0.1:3000` is the gateway’s localhost, not the runtime. Set **TASK_STATUS_BASE_URL** to a URL the **gateway** can use to reach the runtime (e.g. `http://runtime:3000` when both run in Docker Compose). The runtime’s docker-compose already sets this for the runtime service; if you run the runtime outside Docker while the gateway is in Docker, set `TASK_STATUS_BASE_URL` in the runtime’s env to the hostname/IP the gateway can resolve (e.g. `host.docker.internal` or the host IP).

## Testing

Unit tests (Vitest) cover delivery (`shouldDeliverToAgent`, `formatNotificationMessage`), agent tools, and task status tool:

```bash
npm run test
```

**Note:** You may see a deprecation warning from Vite’s Node API (“The CJS build of Vite's Node API is deprecated”). This comes from Vitest’s use of Vite internally. The tests run correctly; a follow-up to migrate the runtime to ESM (or update the test runner config) is planned to clear the warning.

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
│   ├── index.ts        # Entry point; starts gateway, delivery, heartbeat, agent-sync, health
│   ├── config.ts       # Env-based config and OpenClaw version detection
│   ├── convex-client.ts # Convex client for service actions
│   ├── gateway.ts      # OpenClaw gateway and session registration
│   ├── delivery.ts     # Notification delivery loop (with backoff)
│   ├── heartbeat.ts    # Per-agent heartbeat scheduler
│   ├── agent-sync.ts   # Periodic agent list sync (new agents without restart)
│   ├── health.ts       # HTTP health server and Convex status updates
│   ├── logger.ts       # Structured logger with levels and secret redaction
│   ├── backoff.ts      # Exponential backoff with jitter
│   └── self-upgrade.ts # Restart and upgrade checks
├── openclaw/           # OpenClaw gateway container (Dockerfile, start script, template)
├── Dockerfile
├── .env.example
└── README.md
```

## Further reading

- [docs/runtime/runtime-docker-compose.md](../../docs/runtime/runtime-docker-compose.md) — Docker Compose local dev and upgrade workflow.
- [docs/build/00-orchestrator.md](../../docs/build/00-orchestrator.md) — Build phases and module 13 (runtime service).
- [docs/concept/lobster-control-cursor-core-instructions.md](../../docs/concept/lobster-control-cursor-core-instructions.md) — Data flows, service auth, invariants.
