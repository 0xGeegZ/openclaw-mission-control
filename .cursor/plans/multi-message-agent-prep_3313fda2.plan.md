---
name: multi-message-agent-prep
overview: Prepare Mission Control for non-streaming multi-message agent outputs with strong idempotency and minimal UI changes, so the architecture is ready for future streaming rollout.
todos:
  - id: setup-worktree
    content: Create isolated worktree + feature branch for multi-message pre-streaming work.
    status: completed
  - id: schema-idempotency
    content: Add message part index schema/index and backward-compatible idempotency path in Convex backend.
    status: completed
  - id: runtime-multipart
    content: Refactor runtime OpenClaw parsing and delivery persistence from single message to ordered message parts.
    status: completed
  - id: tests
    content: Add runtime parser tests and backend multi-part idempotency/retry tests.
    status: completed
  - id: rollout-qa
    content: Define rollout gating, observability, and manual QA checklist for safe deployment.
    status: completed
isProject: false
---

# Multi-Message Agent Replies (Pre-Streaming) Plan

## 1. Context & goal

We will add support for persisting multiple agent messages from a single runtime notification while keeping OpenClaw calls non-streaming (`stream: false`). This prepares the runtime/Convex/UI path for future streaming by removing the current one-notification-one-message assumption. Key constraints: strict multi-tenant boundaries, retry-safe idempotency, backward compatibility for existing messages, no regression in notification delivery semantics, and minimal frontend changes (per your choice).

## 2. Codebase research summary

Main files inspected:

- Runtime delivery/orchestration: `[/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/delivery.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/delivery.ts)`
- Runtime OpenClaw parsing/calls: `[/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/gateway.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/gateway.ts)`
- No-reply fallback helpers: `[/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/delivery/no-response.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/delivery/no-response.ts)`
- Convex schema: `[/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/schema.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/schema.ts)`
- Service message creation/idempotency: `[/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/service/messages.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/service/messages.ts)`
- Service actions bridge: `[/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/service/actions.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/service/actions.ts)`
- Notification read/delivered lifecycle: `[/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/service/notifications.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/service/notifications.ts)`
- User-facing message query: `[/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/messages.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/messages.ts)`
- Thread UI: `[/Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/components/tasks/TaskThread.tsx](/Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/components/tasks/TaskThread.tsx)`, `[/Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/components/tasks/MessageItem.tsx](/Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/components/tasks/MessageItem.tsx)`, `[/Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/components/tasks/MessageContent.tsx](/Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/components/tasks/MessageContent.tsx)`

What we learned and will reuse:

- Runtime currently parses OpenClaw response into a single `text` + `toolCalls` result and persists one message.
- Idempotency today is keyed only by `sourceNotificationId`; this blocks safe multi-message retries.
- Delivery lifecycle (`markNotificationRead` -> send -> create message(s) -> `markNotificationDelivered`) is correct and should be preserved.
- UI already renders any number of messages from `api.messages.listByTask`; minimal UI scope is viable.

Assumptions:

- Assumption A: OpenClaw response payload may contain multiple semantically separate assistant message items inside `output[]`.
- Assumption B: We should keep retry semantics fail-fast: if any part persistence fails, notification is not marked delivered and retry handles remaining parts idempotently.
- Assumption C: Minimal UI change means no new grouping/divider behavior in this phase.

## 3. High-level design

We will introduce message-part idempotency at the backend and propagate it from runtime.

```mermaid
flowchart LR
  notif[UndeliveredNotification] --> read[markNotificationRead]
  read --> send[sendToOpenClaw stream:false]
  send --> parse[ParseResponseToMessageParts + toolCalls]
  parse --> tools[executeAgentTool + sendOpenClawToolResults]
  tools --> parts[FinalMessageParts[]]
  parts --> persist[createMessageFromAgent per partIndex]
  persist --> delivered[markNotificationDelivered]
  persist --> retry[OnFailure markDeliveryEnded retry loop]
```

Architecture fit:

- Runtime (`delivery.ts`, `gateway.ts`) will emit ordered `messageParts: string[]` instead of one text blob.
- Convex service layer (`actions.ts` -> `service/messages.ts`) will accept `sourceNotificationPartIndex` and enforce idempotency on `(sourceNotificationId, sourceNotificationPartIndex)`.
- UI stays query-based and real-time via Convex; no protocol changes required.

## 4. File & module changes

### Existing files to touch

- `[/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/gateway.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/gateway.ts)`
  - Change `SendToOpenClawResult` from `{ text: string | null; toolCalls: ... }` to `{ texts: string[]; toolCalls: ... }`.
  - Refactor `parseOpenClawResponseBody()` to extract ordered message parts from `output[]` and keep backward-compatible fallbacks (`output_text`, `text`, `content`).
  - Update `sendOpenClawToolResults()` return type from `Promise<string | null>` to `Promise<string[]>`.
- `[/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/delivery.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/delivery.ts)`
  - Replace single `textToPost` flow with `textsToPost: string[]`.
  - Apply placeholder/no-reply handling per message part (with current fallback rules).
  - Persist each part sequentially via `createMessageFromAgent`, passing `sourceNotificationPartIndex`.
  - Keep existing fail-fast behavior and notification delivery ordering.
- `[/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/schema.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/schema.ts)`
  - Add optional `sourceNotificationPartIndex: v.optional(v.number())` to `messages` table.
  - Add index: `by_source_notification_part` on `['sourceNotificationId', 'sourceNotificationPartIndex']`.
  - Retain existing `by_source_notification` index for backward compatibility.
- `[/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/service/actions.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/service/actions.ts)`
  - Extend `createMessageFromAgent` args with optional `sourceNotificationPartIndex`.
  - Forward new arg to `internal.service.messages.createFromAgent`.
  - Keep API contract backward-compatible (optional field).
- `[/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/service/messages.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/service/messages.ts)`
  - Extend `createFromAgent` args with optional `sourceNotificationPartIndex`.
  - Implement idempotency lookup using `by_source_notification_part`.
  - Backward-compat fallback: when `partIndex` is `0`, treat legacy messages with undefined part index as equivalent.
  - Store `sourceNotificationPartIndex` in inserted messages (default to `0` when `sourceNotificationId` exists and index omitted).
- `[/Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/components/tasks/TaskThread.tsx](/Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/components/tasks/TaskThread.tsx)`
  - No required behavior change for this phase; add only if needed for tiny robustness (none planned by default).

### New files to create

- `[/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/gateway.parse-response.test.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/gateway.parse-response.test.ts)`
  - Unit tests for multi-part response parsing order and fallback behavior.
- `[/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/service/messages.multi-part.test.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/service/messages.multi-part.test.ts)`
  - Tests for idempotency by `(sourceNotificationId, sourceNotificationPartIndex)` and backward compatibility.

## 5. Step-by-step tasks

1. **Workspace isolation setup (no feature code yet)**

- From repo root, create a feature worktree and branch: `feat/multi-message-prestream`.
- Ensure implementation commands run from the worktree path only.

2. **Define runtime response-part model**

- Edit `SendToOpenClawResult` in `gateway.ts` to `texts: string[]`.
- Refactor parser to return ordered parts; preserve existing single-text fallbacks.
- Update `sendToOpenClaw()` and `sendOpenClawToolResults()` callers/types.

3. **Introduce backend part-index schema support**

- Add optional `sourceNotificationPartIndex` to messages schema.
- Add `by_source_notification_part` composite index.
- Run Convex codegen/dev flow required for schema updates.

4. **Extend service action/mutation contracts**

- Add optional `sourceNotificationPartIndex` to `createMessageFromAgent` action args.
- Thread argument through to `service/messages.createFromAgent`.

5. **Implement idempotency logic for message parts**

- In `service/messages.ts`, use composite index for idempotency check.
- Add backward-compatible fallback for legacy messages when `partIndex===0`.
- Ensure inserted records store part index deterministically.

6. **Refactor delivery persistence to multi-part**

- Convert single `textToPost` flow to `textsToPost` array in `delivery.ts`.
- After tool execution, compute final array of message parts.
- For each part, call `createMessageFromAgent` with `sourceNotificationPartIndex`.
- Keep `markNotificationDelivered` only after all parts are persisted.

7. **Preserve no-reply/placeholder behavior per part**

- Reuse existing `parseNoResponsePlaceholder` and fallback builder per part.
- Maintain existing suppression rules for placeholder fallback messages.

8. **Runtime + backend test implementation**

- Add parser tests for multi-output and mixed function_call/output payloads.
- Add backend tests for multi-part idempotency and retry safety.
- Add delivery tests (or extend current ones) for partial failure + retry behavior.

9. **Manual QA and regression checks**

- Validate one notification yields N ordered agent messages.
- Simulate retry after partial write and confirm no duplicates.
- Confirm typing indicator/read receipts and message thread behavior remain correct.

10. **Changeset and rollout gating**

- Add/update changeset notes.
- Optionally gate runtime behavior with config flag (`ENABLE_MULTI_PART_AGENT_MESSAGES`) default-on in non-prod first.

## 6. Edge cases & risks

- **Duplicate writes on retry**: solved by composite idempotency key; verify partial-failure retries.
- **Legacy data compatibility**: old messages with only `sourceNotificationId` must still map to part `0`.
- **Ordering drift**: must persist sequentially in runtime loop (`await` each write).
- **Empty/whitespace parts**: drop before persistence.
- **Placeholder/no-reply mixed payloads**: process per part; avoid persisting invalid placeholders when fallback disabled.
- **Tool-call responses with no final text**: preserve current fallback behavior after tools.
- **Notification lifecycle correctness**: never mark delivered until all parts persisted.
- **Cardinality growth in long threads**: acceptable now; monitor query/render latency.

## 7. Testing strategy

### Unit tests

- Runtime parser (`gateway.parse-response.test.ts`):
  - `output_text` only -> one part.
  - `output[]` with multiple text blocks -> multiple ordered parts.
  - mixed `function_call` + text output.
  - malformed JSON fallback path.
- Backend idempotency (`messages.multi-part.test.ts`):
  - same `(notification, partIndex)` returns same message id.
  - same notification, different part index creates distinct messages.
  - legacy message (no part index) treated as part `0`.

### Integration tests

- Delivery flow in runtime tests:
  - notification with 3 parts persists 3 messages in order.
  - fail on part 2, retry, and assert no duplicates for part 1.
  - mark delivered called only after all parts succeed.

### Manual QA checklist

- Create user message that triggers agent multi-part output.
- Confirm thread shows multiple consecutive agent messages.
- Confirm no duplicate messages after induced runtime retry/restart.
- Confirm mention badges still render correctly in each part.
- Confirm typing indicator clears after delivery completion.

## 8. Rollout / migration

- **Deployment approach**:
  - Deploy schema + backend compatibility first.
  - Deploy runtime part-index writes second.
  - Keep compatibility fallback for pre-existing messages.
- **Feature gating**:
  - Optional env flag for runtime to enable multi-part persistence progressively.
- **Observability**:
  - Add logs for `notificationId`, `partIndex`, and persisted `messageId`.
  - Track counters: parts persisted per notification, idempotent hit count, retry count.
- **Kill switch**:
  - Runtime flag to collapse back to single message mode if regression appears.

## 9. TODO checklist

### Setup

- Create isolated worktree and feature branch `feat/multi-message-prestream`.
- Confirm implementation tools/terminal run from worktree path.

### Backend (Convex)

- Add `sourceNotificationPartIndex` optional field in `messages` schema.
- Add `by_source_notification_part` index in schema.
- Regenerate Convex artifacts after schema update.
- Extend `createMessageFromAgent` action args with `sourceNotificationPartIndex`.
- Extend `service/messages.createFromAgent` args with `sourceNotificationPartIndex`.
- Implement idempotency check using `(sourceNotificationId, sourceNotificationPartIndex)`.
- Implement backward-compat fallback for legacy part-0 messages.
- Persist `sourceNotificationPartIndex` on insert.

### Runtime

- Refactor `SendToOpenClawResult` to use `texts: string[]`.
- Update OpenClaw response parser to produce ordered message parts.
- Update `sendOpenClawToolResults` return type to `string[]`.
- Refactor delivery flow to persist each message part sequentially.
- Pass `sourceNotificationPartIndex` to `createMessageFromAgent`.
- Preserve current no-reply and placeholder fallback semantics per part.
- Ensure `markNotificationDelivered` runs only after all parts are persisted.

### Frontend

- Verify no code changes are required for minimal UI scope.
- Manually validate thread rendering for multiple agent messages.

### Tests

- Add runtime parser unit tests for multi-part payloads.
- Add backend multi-part idempotency tests.
- Add/extend delivery retry tests for partial persistence scenarios.
- Run relevant test suites and confirm no regressions.

### Rollout & QA

- Add runtime logs/metrics for multi-part persistence.
- Perform staged rollout (dev -> staging -> production).
- Execute manual QA checklist across normal and retry scenarios.
- Add/update changeset entry documenting behavior change.
