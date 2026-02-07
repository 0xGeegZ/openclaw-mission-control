---
name: runtime-cost-reduction-phase1
overview: Plan Phase 1 config-only changes to reduce runtime polling costs while keeping notification latency at ~15 seconds.
todos:
  - id: cfg-intervals
    content: Update runtime default intervals in config.ts
    status: completed
  - id: cfg-profile-sync
    content: Make OPENCLAW_PROFILE_SYNC opt-in by default
    status: completed
  - id: docs-runtime-defaults
    content: Document new defaults + env overrides
    status: completed
isProject: false
---

# Runtime Cost Reduction Phase 1 Plan

## 1. Context & goal

We will reduce runtime API costs by adjusting config defaults only (no code changes) to increase polling intervals while keeping notification latency around 15 seconds. Constraints: keep runtime behavior stable, avoid breaking Convex/OpenClaw integrations, and stay within existing environment variable contract.

## 2. Codebase research summary

- [apps/runtime/src/config.ts](apps/runtime/src/config.ts) defines defaults for `deliveryInterval`, `agentSyncInterval`, `healthCheckInterval`, and `openclawProfileSyncEnabled` (via `OPENCLAW_PROFILE_SYNC` env).
- [apps/runtime/src/delivery.ts](apps/runtime/src/delivery.ts) uses `config.deliveryInterval` for polling; backoff applies only on errors.
- [apps/runtime/src/agent-sync.ts](apps/runtime/src/agent-sync.ts) runs `listAgents` on `config.agentSyncInterval` and optionally `listAgentsForRuntime` when profile sync is enabled.
- [apps/runtime/src/health.ts](apps/runtime/src/health.ts) uses `config.healthCheckInterval` for periodic Convex status updates.

## 3. High-level design

This phase is config-only: update default interval values in `loadConfig()` and adjust the default for `OPENCLAW_PROFILE_SYNC` to opt-in. The runtime loops already consume these defaults; no data flow changes. The main flow remains:
`loadConfig()` → `startDeliveryLoop` (delivery poll) + `startAgentSync` (agent list sync) + `startHealthServer` (Convex health updates).

## 4. File & module changes

- [apps/runtime/src/config.ts](apps/runtime/src/config.ts)
  - Update default `deliveryInterval` to 15000 ms to target ~15s max latency.
  - Update default `agentSyncInterval` to 300000 ms (5 min).
  - Update default `healthCheckInterval` to 300000 ms (5 min).
  - Change default `openclawProfileSyncEnabled` to `false` unless `OPENCLAW_PROFILE_SYNC` is explicitly `true`.

## 5. Step-by-step tasks

1. Edit [apps/runtime/src/config.ts](apps/runtime/src/config.ts) to update default values for `deliveryInterval`, `agentSyncInterval`, and `healthCheckInterval`.
2. Adjust the `openclawProfileSyncEnabled` default behavior so that profile sync is opt-in via `OPENCLAW_PROFILE_SYNC=true`.
3. Update any inline comments or docstrings in `config.ts` that mention default intervals to match new values.
4. Add a short note to runtime docs or README if one exists (confirm location) to document new defaults and env overrides.

## 6. Edge cases & risks

- **Notification latency:** With 15s polling, worst-case delivery latency increases; mitigate by confirming this is acceptable (already specified).
- **Profile sync off by default:** New agents relying on OpenClaw profile files may require explicit opt-in; mitigate via documentation and release notes.
- **Monitoring expectations:** Health checks every 5 minutes reduce freshness of `updateRuntimeStatus` fields.

## 7. Testing strategy

- **Unit tests:** None required for config defaults unless there are existing config tests.
- **Integration:** Start runtime locally with defaults and verify:
  - Delivery loop logs show 15s interval.
  - Agent sync logs show 5 min interval.
  - Health check logs show 5 min interval.
- **Manual QA checklist:**
  - Confirm notifications still deliver within ~15s.
  - Confirm agent list updates within 5 minutes without restart.
  - Confirm health status updates continue and no errors in logs.

## 8. Rollout / migration

- Deploy as a normal runtime update.
- Monitor delivery latency and Convex runtime status freshness for 48 hours.
- Provide a rollback path by setting env vars back to prior defaults if needed.

## 9. TODO checklist

- Update default `deliveryInterval` to 15000 ms in `config.ts`.
- Update default `agentSyncInterval` to 300000 ms in `config.ts`.
- Update default `healthCheckInterval` to 300000 ms in `config.ts`.
- Make `OPENCLAW_PROFILE_SYNC` opt-in by default (`false` unless set to `true`).
- Update relevant runtime documentation with new defaults and env overrides.
- Smoke test runtime locally to confirm timing/logs.
- Monitor production for 48 hours and record savings/latency metrics.

