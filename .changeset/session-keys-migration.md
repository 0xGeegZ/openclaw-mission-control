---
"runtime-service": minor
"@packages/backend": minor
---

Backend-resolved task and system session keys; delivery uses OpenResponses instructions + compact input.

- **Backend:** `agentRuntimeSessions` table and `resolveSessionKeys`; `getNotificationForDelivery` returns `deliverySessionKey` (task or system). Session keys no longer derived from legacy `agents.sessionKey`.
- **Runtime:** Gateway and delivery use backend-resolved keys only; `buildDeliveryInstructions` + `buildNotificationInput` split; `task_history` tool; health and agent-sync register system keys from resolver.
