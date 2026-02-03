# Code Review: Agent Response Write-back

**Plan:** [agent-response-writeback_0af64cca.plan.md](../../.cursor/plans/agent-response-writeback_0af64cca.plan.md)  
**Scope:** OpenClaw response capture → Convex task thread write-back with idempotency.

---

## 1. Understanding the change

- **Goal:** Capture the OpenClaw `/v1/responses` reply and write it to the Mission Control task thread via `createMessageFromAgent`, only for notifications with a `taskId`. Heartbeats stay send-only. Idempotency via `sourceNotificationId` to avoid duplicates on retry.
- **Files touched:**
  - **Runtime:** `apps/runtime/src/gateway.ts`, `delivery.ts`, `config.ts`, `.env.example`
  - **Convex:** `packages/backend/convex/schema.ts`, `service/messages.ts`, `service/actions.ts`
  - **Docs:** `docs/runtime/runtime-docker-compose.md`, `apps/runtime/README.md`
- **Assumption:** `getNotificationForDelivery` returns `{ notification, task?, agent }` with `notification.taskId` when the notification is task-scoped. No change to that contract was required.

---

## 2. Review checklist

### Functionality

| Criterion | Status | Notes |
|-----------|--------|--------|
| Intended behavior works and matches requirements | ✅ | Sync write-back: send to OpenClaw → parse response → create message when `taskId` + non-empty response → mark delivered. |
| Edge cases handled gracefully | ✅ | Parser handles `output_text`, `output[]`, top-level `text`/`content`; JSON parse failure returns `null`. Empty/whitespace response skips posting. No `taskId` skips posting. Idempotency: existing message by `sourceNotificationId` returns existing id, no duplicate insert. |
| Error handling appropriate and informative | ✅ | Gateway: timeout (AbortController), non-2xx, missing URL/session throw with clear messages; `lastSendError` set. Delivery: per-notification try/catch, log and increment failed count; failed notification stays undelivered so it will be retried. |

**Minor suggestion (edge case):** When OpenClaw returns 2xx but parsed response is empty (e.g. unknown JSON shape), delivery still marks the notification delivered and no message is posted. Plan said “skip posting and log.” Consider a debug log when `taskId` exists but `responseText` is empty so operators can see “delivered but no reply captured” in debug logs, e.g. in `delivery.ts` after the `if (taskId && responseText?.trim())` block:

```ts
if (taskId && !responseText?.trim()) {
  log.debug("No response text to write back for notification", notification._id);
}
```

---

### Code quality

| Criterion | Status | Notes |
|-----------|--------|--------|
| Code structure clear and maintainable | ✅ | Parser in gateway is a pure function; `sendToOpenClaw` returns `string \| null`; delivery flow is linear (send → maybe create message → mark delivered). |
| No unnecessary duplication or dead code | ✅ | No duplication. `receiveFromOpenClaw` in gateway remains as a future webhook path and does not pass `sourceNotificationId`; acceptable and documented in JSDoc. |
| Tests/documentation updated as needed | ✅ | Schema field and index documented; service action and internal mutation JSDoc mention idempotency; runtime README and docker-compose doc describe write-back and `OPENCLAW_REQUEST_TIMEOUT_MS`. |

**Optional improvement:** `formatNotificationMessage(context: any)` in delivery could use a typed context (e.g. return type of `getNotificationForDelivery`) instead of `any` for better maintainability and refactor safety.

---

### Security & safety

| Criterion | Status | Notes |
|-----------|--------|--------|
| No obvious security vulnerabilities introduced | ✅ | `createMessageFromAgent` remains service-only (`requireServiceAuth`); account/agent/task validated; runtime uses same service token as before. |
| Inputs validated and outputs sanitized | ✅ | `sourceNotificationId` is `v.id("notifications")`. Response parser consumes JSON and returns a string (no raw HTML/script written); Convex message content is stored as-is (same as existing user/agent messages). |
| Sensitive data handled correctly | ✅ | Gateway token redacted in `getGatewayState()`; no new secrets in logs. |

---

## 3. Additional review notes

### Architecture and design

- Sync write-back from the HTTP response body is consistent with the plan and avoids a separate callback or polling step.
- Idempotency key on `messages` is correct: one message per `sourceNotificationId`; index `by_source_notification` is sufficient (notification ids are unique).
- Heartbeats correctly remain send-only: `heartbeat.ts` only calls `sendToOpenClaw` and `updateAgentHeartbeat`; no `createMessageFromAgent`.

### Order of operations (delivery)

- Order is: `sendToOpenClaw` → if `taskId` and `responseText`, `createMessageFromAgent` → `markNotificationDelivered`.
- If `createMessageFromAgent` throws, we never mark delivered → notification is retried → idempotency prevents duplicate message. Correct.

### Performance and configuration

- `OPENCLAW_REQUEST_TIMEOUT_MS` (default 60s) is applied to the fetch via `AbortController`; no minimum clamp. If someone sets a very low or negative value, `parseIntOrDefault` can return it; consider clamping to e.g. 5_000–300_000 ms in config if you want to harden misconfiguration.
- Non-streaming (`stream: false`) is required so the full body is available; documented.

### Return type (idempotency)

- `createFromAgent` returns `existing._id` when a message with the same `sourceNotificationId` exists; the public action returns `{ messageId }`. The runtime does not need the returned id for the delivery flow; it only needs success. No change required.

---

## 4. Summary

| Area | Verdict |
|------|--------|
| Functionality | ✅ Meets plan; optional debug log when taskId present but response empty. |
| Code quality | ✅ Solid; optional typing for delivery context. |
| Security & safety | ✅ No issues. |
| Architecture / design | ✅ Aligned with plan and docs. |

**Verdict:** Approve. Implementation matches the agent-response-writeback plan. Optional follow-ups: (1) debug log when skipping write-back due to empty response, (2) type `formatNotificationMessage` context, (3) optional clamp for `OPENCLAW_REQUEST_TIMEOUT_MS`.
