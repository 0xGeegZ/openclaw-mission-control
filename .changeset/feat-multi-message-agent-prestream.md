---
"@packages/backend": minor
"runtime-service": minor
---

Support multiple agent messages per notification (pre-streaming). Runtime now parses OpenClaw response into ordered message parts and persists each with `sourceNotificationPartIndex` for idempotent retries. Backend adds `sourceNotificationPartIndex` and composite index `by_source_notification_part`; legacy messages without part index remain compatible.
