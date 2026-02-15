---
"runtime-service": major
---

**V1 — OpenClaw Mission Control Runtime Service**

First stable release of the per-account agent runtime: a Node.js service that runs the OpenClaw (Clawdbot) gateway, delivers notifications from Convex to agents, runs heartbeats, and exposes health and agent HTTP fallbacks. Designed for one runtime instance per customer account (e.g. one DigitalOcean Droplet per account).

**Architecture and startup**

- Single process: load config (env), init Convex client (service token, account-scoped), init OpenClaw gateway, start health HTTP server, run profile sync once (openclaw.json and per-agent workspaces), wait for gateway ready, then start delivery loop, heartbeats, and agent sync. Graceful shutdown on SIGTERM/SIGINT: stop delivery, agent sync, heartbeats, shutdown gateway, update runtime status to offline in Convex.

**Convex integration**

- Service token auth; all Convex calls scoped to `ACCOUNT_ID`. Used for: fetching undelivered notifications, posting agent messages, updating task status and documents, agent list sync, heartbeat and runtime status updates, runtimes/accounts mutations (restart, upgrade, rollback). Convex client reused across delivery, heartbeat, agent-sync, and health.

**Gateway**

- `initGateway`: start OpenClaw gateway process (configurable path/args). `sendToOpenClaw`: POST to OpenResponses `/v1/responses` with session key header and body (message, tools, user for session routing). Parse response: `output_text` and `output[]` (message + function_call). Execute tool calls via `executeAgentTool`, send function_call_output back to gateway, collect final text and optional further tool rounds. `shutdownGateway`. Session key format: `agent:{slug}:{accountId}`.

**Delivery loop**

- Poll Convex for undelivered notifications (mentions, assignments, response_request, thread_update, status_change). For each: resolve task, agent, account; apply delivery policy (`shouldDeliverToAgent`, `canAgentMarkDone`, orchestrator-chat and reviewer rules). Build prompt via `formatNotificationMessage` and `buildHttpCapabilityLabels` (capability text for prompt). Send to OpenClaw with per-request tools (task_status, task_update, task_create, document_upsert, response_request, task_load, get_agent_skills; orchestrator-only: task_list, task_get, task_thread, task_search, task_delete, task_message, task_assign, task_link_pr). On response: execute tool calls (taskStatusTool, taskUpdateTool, taskDeleteTool, createTaskFromAgent, documentUpsert, etc.), write agent message to Convex thread, mark notification delivered. No-response handling: retry budget and deterministic fallback message where required; optional terminal skip for passive notifications. Backoff on poll errors; metrics (success/failure counts, consecutive failures).

**Agent tools (OpenResponses function tools)**

- **task_status** — Update task status (inbox → assigned → in_progress → review → done / blocked); optional blockedReason. Policy: only reviewers (e.g. Squad Lead, QA) can set done unless `canMarkDone`.
- **task_update** — Update title, description, priority, labels, assignees, status, dueDate.
- **task_create** — Create task with title, description, priority, labels, status, assigneeSlugs (orchestrator only for assignees).
- **document_upsert** — Create or update document linked to task.
- **response_request** — Request another agent to respond in the thread.
- **task_load** — Load task plus thread (utility).
- **get_agent_skills** — Fetch skills for one or all agents.
- Orchestrator-only: **task_list**, **task_get**, **task_thread**, **task_search**, **task_delete**, **task_message**, **task_assign**, **task_link_pr** (link task to GitHub PR). Tool set per agent is determined by behavior flags and role (orchestrator vs regular).

**Heartbeats**

- Scheduler per agent from Convex roster; each agent has a schedule. On tick: send heartbeat payload to OpenClaw (session key); on success call Convex `updateAgentHeartbeat`. Uses heartbeat-constants for OK response detection.

**Agent sync**

- Periodic fetch of agent list from Convex; update local roster so new or updated agents are used without restarting the runtime.

**Profile sync**

- One-time (at startup): write OpenClaw config (openclaw.json) and per-agent workspace files (SOUL.md, TOOLS.md, AGENTS.md, HEARTBEAT.md when profile sync enabled). Optional `OPENCLAW_AGENTS_MD_PATH` / `OPENCLAW_HEARTBEAT_MD_PATH` for repo-sourced content. Env `OPENCLAW_PROFILE_SYNC=true` to enable.

**Health server**

- HTTP server (default port 3000). **GET /health** — Full JSON: gateway state, delivery state (deliveredCount, consecutiveFailures, lastErrorAt, lastErrorMessage), runtime and OpenClaw versions, droplet/infra ids, uptime, metrics. **GET /version** — Lightweight: runtime version, OpenClaw version, droplet id/region. Agent endpoints (POST, require `x-openclaw-session-key`, local-only): `/agent/task-status`, `/agent/task-create`, `/agent/task-assign`, `/agent/response-request`, `/agent/document`, `/agent/task-message`, `/agent/task-list`, `/agent/task-get`, `/agent/task-thread`, `/agent/task-search`, `/agent/task-load`, `/agent/get-agent-skills`, `/agent/task-delete`, `/agent/task-link-pr`. Used as HTTP fallbacks when client-side tools are disabled. Session validation: 401 if session key missing or unknown.

**Config and deployment**

- Required: `ACCOUNT_ID`, `CONVEX_URL`, `SERVICE_TOKEN`. Optional: `HEALTH_PORT`, `HEALTH_HOST`, `DELIVERY_INTERVAL`, `OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN`, `TASK_STATUS_BASE_URL` (URL gateway uses to reach runtime), `OPENCLAW_REQUEST_TIMEOUT_MS`, backoff and logging options, droplet/infra ids. Docker: Dockerfile (build from monorepo root); docker-compose.runtime.yml with optional `openclaw` profile for gateway. Self-upgrade: check Convex for restart or upgrade request; apply upgrade and restart when requested.

**Observability and tests**

- Metrics: success/failure counters; Prometheus-formatted export. Unit tests: delivery policy, no-response handling, agent tools (task status, task update, task delete), gateway parsing. Integration-style tests: health endpoint, agent endpoints (session required, 401 when missing or unknown).

**Worktree isolation (agent work)**

- Documentation and support for per-task worktrees: main repo clone plus worktrees directory; each task uses a dedicated worktree so agent commits and PRs stay isolated. See docs/runtime/AGENTS.md.

This release marks the runtime as production-ready for the first stable deployment (1.0.0).
