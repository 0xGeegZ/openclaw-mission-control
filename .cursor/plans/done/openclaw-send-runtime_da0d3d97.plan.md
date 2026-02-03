---
name: openclaw-send-runtime
overview: Implement real OpenClaw message delivery from the runtime via the Gateway OpenResponses HTTP API so assignment notifications and heartbeats reach agent sessions.
todos: []
isProject: false
---

# OpenClaw HTTP Send Plan

## 1. Context & goal

Implement the missing OpenClaw send path in the runtime so `delivery.ts` and `heartbeat.ts` can actually deliver messages to agent sessions. Use OpenClaw’s OpenResponses HTTP endpoint (`POST /v1/responses`) with session routing via `x-openclaw-session-key`, while keeping the current Convex-driven delivery loop intact.

Key constraints:

- Runtime is Node 24; use built-in `fetch` (no new dependencies).
- Gateway endpoint is disabled by default and must be enabled in OpenClaw config.
- Auth should follow OpenClaw gateway token semantics.
- Preserve existing delivery/heartbeat retries and error handling.

## 2. Codebase research summary

Files inspected:

- [apps/runtime/src/gateway.ts](apps/runtime/src/gateway.ts) — `sendToOpenClaw` is a TODO stub.
- [apps/runtime/src/delivery.ts](apps/runtime/src/delivery.ts) — calls `sendToOpenClaw` for notifications.
- [apps/runtime/src/heartbeat.ts](apps/runtime/src/heartbeat.ts) — calls `sendToOpenClaw` for heartbeat messages.
- [apps/runtime/src/config.ts](apps/runtime/src/config.ts) — runtime env parsing; no OpenClaw gateway URL/token yet.
- [apps/runtime/openclaw/openclaw.json.template](apps/runtime/openclaw/openclaw.json.template) — gateway config lacks HTTP endpoint enablement.
- [apps/runtime/openclaw/start-openclaw.sh](apps/runtime/openclaw/start-openclaw.sh) — merges env into OpenClaw config; sets `CLAWDBOT_GATEWAY_TOKEN`.
- [apps/runtime/.env.example](apps/runtime/.env.example), [apps/runtime/README.md](apps/runtime/README.md), [docs/runtime/runtime-docker-compose.md](docs/runtime/runtime-docker-compose.md) — env docs to update.
- [docs/concept/openclaw-mission-control-initial-article.md](docs/concept/openclaw-mission-control-initial-article.md) and [docs/concept/openclaw-mission-control-cursor-core-instructions.md](docs/concept/openclaw-mission-control-cursor-core-instructions.md) — runtime is responsible for delivering agent notifications/heartbeats via the gateway.
- OpenClaw OpenResponses HTTP API doc (OpenResponses API) — endpoint, headers, and auth model.

Key existing patterns:

- Runtime uses a single `RuntimeConfig` object from env.
- Delivery loop already retries and leaves notifications undelivered on error.
- Gateway state is centralized in `gateway.ts`.

## 3. High-level design

- Add gateway connection settings to runtime config:
  - `openclawGatewayUrl` (e.g., `http://127.0.0.1:18789` locally, `http://openclaw-gateway:18789` in Docker).
  - `openclawGatewayToken` (prefer `OPENCLAW_GATEWAY_TOKEN`, fallback to `CLAWDBOT_GATEWAY_TOKEN`).
- Implement `sendToOpenClaw` to call OpenClaw’s OpenResponses HTTP API:
  - `POST {openclawGatewayUrl}/v1/responses`
  - Headers:
    - `Content-Type: application/json`
    - `Authorization: Bearer <token>` (omit if token unset)
    - `x-openclaw-session-key: <sessionKey>`
  - Body: `{ "model": "openclaw", "input": "<message>" }`
- Enable the HTTP endpoint in OpenClaw config (`gateway.http.endpoints.responses.enabled = true`) via template + startup merge.
- Preserve delivery loop behavior: if send fails, throw so notification remains undelivered and backoff applies.

## 4. File & module changes

Existing files to touch:

- [apps/runtime/src/config.ts](apps/runtime/src/config.ts)
  - Add `openclawGatewayUrl` and `openclawGatewayToken` to `RuntimeConfig`.
  - Parse env: `OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN`, fallback to `CLAWDBOT_GATEWAY_TOKEN`.
  - Add sensible defaults when unset (local host), but allow explicit disable by empty/invalid URL.
- [apps/runtime/src/gateway.ts](apps/runtime/src/gateway.ts)
  - Store gateway settings (URL/token) in module state when `initGateway` is called.
  - Replace TODO in `sendToOpenClaw` with HTTP `fetch` to `/v1/responses`.
  - Handle non-2xx responses by throwing a descriptive error that includes status and response text.
  - Optionally track `lastSendAt` / `lastSendError` in gateway state for health visibility.
- [apps/runtime/openclaw/openclaw.json.template](apps/runtime/openclaw/openclaw.json.template)
  - Add `gateway.http.endpoints.responses.enabled: true` in the template so first-run config supports HTTP.
- [apps/runtime/openclaw/start-openclaw.sh](apps/runtime/openclaw/start-openclaw.sh)
  - Enforce `gateway.http.endpoints.responses.enabled = true` on every boot.
  - Accept `OPENCLAW_GATEWAY_TOKEN` and fallback to `CLAWDBOT_GATEWAY_TOKEN` when setting `gateway.auth.token`.
- [apps/runtime/.env.example](apps/runtime/.env.example)
  - Add `OPENCLAW_GATEWAY_URL` and `OPENCLAW_GATEWAY_TOKEN` (document fallback to `CLAWDBOT_GATEWAY_TOKEN`).
- [apps/runtime/README.md](apps/runtime/README.md) and [docs/runtime/runtime-docker-compose.md](docs/runtime/runtime-docker-compose.md)
  - Document new gateway URL/token vars and that the HTTP endpoint is required.
- [apps/runtime/src/health.ts](apps/runtime/src/health.ts) (optional)
  - If gateway state adds send error metrics, surface them in `/health` for diagnostics.

## 5. Step-by-step tasks

1. Update runtime config to include OpenClaw gateway URL/token, including env parsing and defaults. Edit [apps/runtime/src/config.ts](apps/runtime/src/config.ts) and update `.env` docs in [apps/runtime/.env.example](apps/runtime/.env.example).
2. Enable OpenResponses HTTP endpoint in the OpenClaw gateway config. Update [apps/runtime/openclaw/openclaw.json.template](apps/runtime/openclaw/openclaw.json.template) and enforce it in [apps/runtime/openclaw/start-openclaw.sh](apps/runtime/openclaw/start-openclaw.sh). Add token fallback logic.
3. Implement the HTTP send in `sendToOpenClaw`. Edit [apps/runtime/src/gateway.ts](apps/runtime/src/gateway.ts) to call `/v1/responses` with `x-openclaw-session-key` and bearer token; add robust error handling.
4. (Optional) Extend gateway/health state to expose last send error info in `/health` for easier debugging. Edit [apps/runtime/src/health.ts](apps/runtime/src/health.ts).
5. Update runtime docs to reflect new env vars and send flow. Edit [apps/runtime/README.md](apps/runtime/README.md) and [docs/runtime/runtime-docker-compose.md](docs/runtime/runtime-docker-compose.md).
6. Manual QA: run runtime + gateway, create task assignment, confirm OpenClaw Control UI shows the message and that Convex notification is marked delivered only on success.

## 6. Edge cases & risks

- **HTTP endpoint disabled**: requests return 404; ensure `gateway.http.endpoints.responses.enabled = true` is enforced.
- **Auth errors (401/403)**: token mismatch or unset; runtime should log a clear error and avoid marking notifications delivered.
- **Gateway unreachable**: network/DNS failures; delivery loop already retries with backoff.
- **Large messages**: OpenResponses has body limits; keep message content concise (current notification format is small).
- **Session routing**: use `x-openclaw-session-key` to ensure stable agent session identity.

## 7. Testing strategy

- **Manual QA**
  - Start Docker Compose with profile `openclaw` and set `OPENCLAW_GATEWAY_URL=http://openclaw-gateway:18789`.
  - Confirm `POST /v1/responses` works with curl and `x-openclaw-session-key`.
  - Assign a task to an agent; verify runtime logs show successful POST and OpenClaw Control UI displays the message.
  - Verify failed sends leave notifications undelivered (simulate by stopping gateway).
- **Lightweight script check (optional)**
  - Add a short one-off curl example to docs for troubleshooting.

## 8. Rollout / migration

- No data migrations required.
- Default to local gateway URL; document required env for Docker and production.
- If `OPENCLAW_GATEWAY_URL` is missing/invalid, fail fast on send with a descriptive error to avoid silent drops.

## 9. TODO checklist

**Runtime**

- Add `openclawGatewayUrl` + `openclawGatewayToken` to [apps/runtime/src/config.ts](apps/runtime/src/config.ts).
- Implement HTTP send in [apps/runtime/src/gateway.ts](apps/runtime/src/gateway.ts) using `POST /v1/responses` and `x-openclaw-session-key`.
- (Optional) Expose last send error in [apps/runtime/src/health.ts](apps/runtime/src/health.ts).

**OpenClaw Docker**

- Enable OpenResponses endpoint in [apps/runtime/openclaw/openclaw.json.template](apps/runtime/openclaw/openclaw.json.template).
- Enforce endpoint + token fallback in [apps/runtime/openclaw/start-openclaw.sh](apps/runtime/openclaw/start-openclaw.sh).

**Docs**

- Update [apps/runtime/.env.example](apps/runtime/.env.example) with `OPENCLAW_GATEWAY_URL` and `OPENCLAW_GATEWAY_TOKEN` (fallback noted).
- Update [apps/runtime/README.md](apps/runtime/README.md) and [docs/runtime/runtime-docker-compose.md](docs/runtime/runtime-docker-compose.md).

**QA**

- Run local Docker Compose and verify assignment/heartbeat messages appear in OpenClaw Control UI.
- Simulate gateway down and confirm notifications remain undelivered with error logs.

