---
"runtime-service": patch
"@packages/backend": patch
"web-app": patch
---

USER.md + IDENTITY.md prompt layering and behavior flags (PR #128).

- **Schema:** `accounts.settings.userMd`, `agents.identityContent`, behavior flags `canReviewTasks` / `canMarkDone` (account + agent).
- **Backend:** `accounts.update` accepts `userMd`; `agents.create`/`update` accept `identityContent`; `migratePromptScaffold` mutation; `listForRuntime` returns effective USER/IDENTITY; fallback helpers in `lib/user_identity_fallback.ts`.
- **Runtime:** Profile sync writes USER.md and IDENTITY.md per agent; delivery policy uses `effectiveBehaviorFlags.canReviewTasks` / `canMarkDone` only (no role/slug heuristics).
- **Web:** Settings > Agent Profile tab for account-shared USER.md (admin-only save); Admin OpenClaw migration button and per-agent behavior flags.
