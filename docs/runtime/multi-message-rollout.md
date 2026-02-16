# Multi-Message Agent Replies (Pre-Streaming) — Rollout & QA

## Summary
The runtime now persists multiple agent message parts per notification when OpenClaw returns multiple output items. Idempotency is per `(sourceNotificationId, sourceNotificationPartIndex)` so retries do not create duplicates.

## Rollout
- Deploy Convex schema and backend first (new index and optional field are backward compatible).
- Deploy runtime second; existing single-message behavior is unchanged (one part, part index 0).
- No feature flag by default; optional env `ENABLE_MULTI_PART_AGENT_MESSAGES` can be added later to gate the behavior if needed.

## Observability
- **Logs:** `Persisted agent message(s) to Convex` includes `notification._id`, `taskId`, agent name, and `partsToPost.length`. Debug log `Persisted message part` includes `notification._id` and `partIndex` per part.
- **Metrics:** Consider adding counters for `delivery.parts_per_notification` (histogram) and idempotent hit rate if needed.

## Manual QA Checklist
- [ ] Send a user message that triggers an agent reply; confirm thread shows one or more agent messages in order.
- [ ] Induce a runtime retry (e.g. restart after partial write); confirm no duplicate messages for the same notification.
- [ ] Confirm typing indicator clears after delivery completes.
- [ ] Confirm mention badges and read receipts still work for multi-part messages.
- [ ] Verify task status auto-advance (assigned → in_progress) still runs after first message when applicable.

## Test coverage (optional follow-up)
- **Delivery retry idempotency:** Integration-style test (e.g. in runtime or backend) that a notification with 3 parts persists 3 messages in order, and that failing on part 2 then retrying does not create duplicates for part 1. Currently covered by unit tests (parser, idempotency helper, action args) and manual QA.
