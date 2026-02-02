# Testing Strategy

## Current state

- **Lint & typecheck:** `npm run lint`, `npm run typecheck` (CI)
- **Manual QA:** See [qa-checklist.md](qa-checklist.md)

## Unit tests (planned)

- **Notification preference logic:** Test `shouldCreateUserNotification` behavior (with mock account/settings) so that when `notificationPreferences.taskUpdates` (or similar) is false, user notifications in that category are skipped unless `forceCreate`.
- **Search helpers:** Test `normalizeQuery` and `matches` (or equivalent) for case-insensitive matching and trimming.
- **Status transitions:** Test `isValidTransition` (task_workflow) for allowed/blocked transitions.

Recommended: add Vitest (or Convex test runner) to `packages/backend` and either export pure helpers from Convex modules for unit tests or use Convex's testing harness for handler tests.

## E2E (planned)

- **Core workflow:** Sign in → create task → assign to agent → notification appears → activity feed updates.
- **OpenClaw admin:** Admin opens OpenClaw page; runtime status and version info load (with mocked or test runtime).

Recommended: add Playwright (or Cypress) for the web app; run against a test Convex deployment and (optionally) a local runtime.

## Running tests

When implemented:

```bash
npm run test          # all packages
npm run test --filter=@packages/backend
```

CI can be extended to run `npm run test` after lint and typecheck.
