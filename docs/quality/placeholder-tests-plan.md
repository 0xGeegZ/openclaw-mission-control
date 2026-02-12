# Plan: Placeholder Tests — Implement or Delete

## 1. Context & goal

Several test files contain **placeholder tests**: they assert on hardcoded values (e.g. `const x = true; expect(x).toBe(true)`) without invoking the code under test. These add noise, give false confidence, and can block useful refactors. This plan identifies every such test and defines whether to **delete** them or **implement** them with real assertions or real code calls.

**Constraints:** No Convex backend in tests today (per `docs/quality/testing.md`). Unit tests use Vitest; E2E use Playwright. Preserve any test that actually calls functions or components and asserts on their return value or side effects.

---

## 2. Codebase research summary

**Files inspected:**

- `packages/backend/convex/security.auth.test.ts` — 27 tests; every test is `const x = true; expect(x).toBe(true)` with comments describing intended behavior. Implementations in `messages.ts` (getCount), `subscriptions.ts` (isSubscribed), `documents.ts` (list), and `lib/validators.ts` already implement the described auth patterns (requireAccountMember, task ownership checks).
- `packages/backend/convex/integration.workflow.test.ts` — Mock context + mix of real assertions (e.g. `expect(activity.type).toBe("member_removed")`) and placeholders (`const deletion = true; expect(deletion).toBe(true)`). ~14 placeholder cases.
- `packages/backend/convex/lib/notifications.test.ts` — `shouldCreateUserNotification` describe block: 6 tests use `const shouldCreate = true|false; expect(shouldCreate).toBe(...)` without calling the real helper. Rest of file has some real mock usage.
- `packages/backend/convex/service/taskDelete.test.ts` — One test: `const validatedByAction = true; expect(validatedByAction).toBe(true)`.
- `apps/web/src/e2e/settings-form.e2e.test.ts` — One: `const tabNavigable = true; expect(tabNavigable).toBe(true)`.
- `apps/web/src/e2e/file-upload.e2e.test.ts` — Two: `dragDropEnabled`, `previewable`.
- `apps/web/src/components/settings/SettingsForm.test.tsx` — Many tests that only assert on local constants (e.g. toggledValue, shouldStayOpen, hasChanges) without rendering or calling the component for that behavior.
- `apps/web/src/components/notifications/NotificationsList.test.tsx` — groupable, contextActions, keyboardNavigable, activatable, accessible, showToast, realTime, shouldPersist, shouldSync.
- `apps/web/src/components/docs/DocumentList.test.tsx` — expectedFocusable, expectedSelectable, expectedDeletable, expectedContextMenu, expectedDragDrop, expectedMovable, expectedBreadcrumb, expectedAccessible.
- `apps/runtime/src/__tests__/health-checks.test.ts` — One: `const searchable = true; expect(searchable).toBe(true)`.

**Patterns to keep (not placeholders):**

- `expect(result).toBe(true)` where `result` comes from calling a function (e.g. `notifications.retry.test.ts`, `task_workflow.test.ts`, `delivery.test.ts`) — **keep**.
- Tests that use mocks and assert on arguments or return values of called functions — **keep**.
- E2E tests that assert on page state after real interactions — **keep**.

---

## 3. High-level design

- **Backend (Convex):** No Convex test harness in use. So “implement” for auth/integration means either (a) delete placeholders and optionally add a short doc that states the required auth pattern, or (b) add unit tests only where the logic is in **exported pure helpers** (e.g. validators, workflow helpers) callable from Vitest.
- **Frontend (components / E2E):** Placeholder tests are documentation-only. Either remove them or replace with real component/E2E tests (render + interact + assert).

**Decision per area:**

| Area | Action | Rationale |
|------|--------|-----------|
| `security.auth.test.ts` | **Delete file** | All 27 tests are placeholders; handlers already correct; no Convex test run. |
| `integration.workflow.test.ts` | **Delete placeholder tests only** | Keep tests that assert on real objects (e.g. activity.type); remove `const x = true; expect(x).toBe(true)`. |
| `lib/notifications.test.ts` | **Replace placeholders with real tests** | `shouldCreateUserNotification` is testable with a mock ctx; testing.md explicitly plans this. |
| `service/taskDelete.test.ts` | **Delete single placeholder** | One test; replace only if we add a real assertion there. |
| E2E (settings-form, file-upload) | **Delete placeholder tests** | 1–2 each; implement later with real Playwright if needed. |
| Component tests (SettingsForm, NotificationsList, DocumentList) | **Delete placeholder tests** | Many; implement later with render + userEvent/react-testing-library. |
| `health-checks.test.ts` | **Delete single placeholder** | One test. |

---

## 4. File & module changes

### Existing files to touch

| File | Changes |
|------|--------|
| `packages/backend/convex/security.auth.test.ts` | Remove entire file. |
| `packages/backend/convex/integration.workflow.test.ts` | Remove only the `it(...)` blocks that contain `const x = true` or `const x = false` followed by `expect(x).toBe(...)` and no other meaningful assertion. Keep `it` blocks that assert on `activity.type`, `update.taskId`, `expectedUpdate.assignedTo`, etc. |
| `packages/backend/convex/lib/notifications.test.ts` | In `shouldCreateUserNotification` describe: replace each placeholder test with a call to `shouldCreateUserNotification` (or the exported helper used by the handler) with a mock ctx and appropriate args; assert on the return value. Use existing `createMockNotificationContext` if it provides account/settings; otherwise extend mock to pass preference flags. |
| `packages/backend/convex/service/taskDelete.test.ts` | Remove the single test that does `const validatedByAction = true; expect(validatedByAction).toBe(true)`. |
| `apps/web/src/e2e/settings-form.e2e.test.ts` | Remove the test that asserts `tabNavigable === true` (placeholder). |
| `apps/web/src/e2e/file-upload.e2e.test.ts` | Remove the two tests that assert `dragDropEnabled` and `previewable` as hardcoded true. |
| `apps/web/src/components/settings/SettingsForm.test.tsx` | Remove each `it` that only asserts on a local constant (toggledValue, shouldStayOpen, hasChanges, resetToInitial, autoDetectButton, isAccessible, submittable, cancellable, shouldSync, persistentState, isForm, labeled, accessible, tabNavigable, goodContrast, keyboardAccessible) without rendering or invoking the component for that behavior. |
| `apps/web/src/components/notifications/NotificationsList.test.tsx` | Remove the placeholder `it` blocks for groupable, contextActions, keyboardNavigable, activatable, accessible, showToast, realTime, shouldPersist, shouldSync. |
| `apps/web/src/components/docs/DocumentList.test.tsx` | Remove the placeholder `it` blocks for keyboard/Enter/Delete/context menu/drag-drop/breadcrumb/accessible (expectedFocusable, expectedSelectable, etc.). |
| `apps/runtime/src/__tests__/health-checks.test.ts` | Remove the single test that does `const searchable = true; expect(searchable).toBe(true)`. |

### New files (optional)

- **Optional:** `docs/quality/auth-patterns.md` — Short doc stating that `messages.getCount`, `subscriptions.isSubscribed`, and `documents.list` must load the task (or validate taskId) and call `requireAccountMember(ctx, task.accountId)` before returning data. Only if the team wants a written contract instead of relying on code review.

### No schema or API changes

---

## 5. Step-by-step tasks

1. **Delete placeholder-only security tests**  
   Delete `packages/backend/convex/security.auth.test.ts` entirely. Run `yarn test` (or `npm run test`) in `packages/backend` to ensure nothing else references it.

2. **Trim integration.workflow.test.ts**  
   In `packages/backend/convex/integration.workflow.test.ts`, remove only the `it` blocks where the body is just `const x = true|false; expect(x).toBe(...)`. Keep every test that asserts on `activity.type`, `update.taskId`, `expectedUpdate.assignedTo`, `notification.type`, `remaining.length`, etc. Exact list to remove: "should log task creation activity" (hasActivityLog), "should allow member to be removed from account" (deletion), "should unsubscribe removed member from all task threads" (shouldUnsubscribe), "should allow deleting document" (deletion), "should cascade delete child documents if folder deleted" (shouldCascadeDelete), and all six "should reject ..." tests in "Error Cases & Recovery" (shouldReject). Re-run tests.

3. **Implement notifications.test.ts shouldCreateUserNotification**  
   In `packages/backend/convex/lib/notifications.test.ts`, find the export for the user-notification decision logic (e.g. `shouldCreateUserNotification` or equivalent in `lib/notifications.ts`). For each of the 6 placeholder tests, call that function with a mock context and args that match the comment (e.g. forceCreate true, preference undefined, preference true, preference false, account not found, missing notificationPreferences). Assert on the boolean return value. If the helper is not exported, either export it for testing or keep one consolidated test that documents the contract and remove the rest.

4. **Remove single placeholder in taskDelete.test.ts**  
   In `packages/backend/convex/service/taskDelete.test.ts`, delete the `it` that sets `validatedByAction = true` and expects it. Run tests.

5. **E2E placeholders**  
   In `apps/web/src/e2e/settings-form.e2e.test.ts` remove the test containing `const tabNavigable = true; expect(tabNavigable).toBe(true)`. In `apps/web/src/e2e/file-upload.e2e.test.ts` remove the two tests containing `dragDropEnabled` and `previewable` placeholders. Run E2E test script if present.

6. **SettingsForm.test.tsx placeholders**  
   In `apps/web/src/components/settings/SettingsForm.test.tsx`, remove each `it` whose body only sets a local constant and asserts on it (no render, no component call for that behavior). Keep tests that call `onSubmit`, assert on `loadingProps.isLoading`, or validate slug/name with real values. Re-run component tests.

7. **NotificationsList.test.tsx placeholders**  
   In `apps/web/src/components/notifications/NotificationsList.test.tsx`, remove the nine placeholder `it` blocks (groupable, contextActions, keyboardNavigable, activatable, accessible, showToast, realTime, shouldPersist, shouldSync). Run tests.

8. **DocumentList.test.tsx placeholders**  
   In `apps/web/src/components/docs/DocumentList.test.tsx`, remove the eight placeholder `it` blocks (expectedFocusable, expectedSelectable, expectedDeletable, expectedContextMenu, expectedDragDrop, expectedMovable, expectedBreadcrumb, expectedAccessible). Run tests.

9. **health-checks.test.ts placeholder**  
   In `apps/runtime/src/__tests__/health-checks.test.ts`, remove the single test that asserts `searchable === true`. Run runtime tests.

10. **Optional: auth doc**  
    If desired, add `docs/quality/auth-patterns.md` with a short list: getCount, isSubscribed, documents.list must validate task and call requireAccountMember before returning data.

---

## 6. Edge cases & risks

- **Risk:** Deleting tests might make someone think auth is untested. **Mitigation:** Implementations are already correct; optional doc or future Convex harness tests can document/verify.
- **Risk:** `lib/notifications.test.ts` might depend on internal (non-exported) helpers. **Mitigation:** Export the minimal pure logic for testing or test via a thin wrapper; avoid testing Convex ctx internals.
- **Risk:** Removing many component tests could reduce coverage numbers. **Mitigation:** Placeholders don’t test behavior; coverage will reflect real behavior after implementing real component tests later.

---

## 7. Testing strategy

- **After deletions:** Run full test suite (`yarn test` or per-package test commands) and fix any broken imports or describe blocks (e.g. empty describe).
- **After implementing notifications.test.ts:** Run `packages/backend` tests; ensure `shouldCreateUserNotification` cases pass for forceCreate, default preference, explicit true/false, account missing, missing preferences.
- **Manual:** Quick smoke: create task, open settings, open notifications list, open docs list — no regressions.

---

## 8. Rollout / migration

- No feature flags or data migration. Pure test and optional doc change.
- Merge after PR review; CI should remain green.

---

## 9. TODO checklist

### Backend

- [ ] Delete `packages/backend/convex/security.auth.test.ts`.
- [ ] In `integration.workflow.test.ts`, remove ~14 placeholder `it` blocks (hasActivityLog, deletion x2, shouldUnsubscribe x2, shouldCascadeDelete, shouldReject x6).
- [ ] In `lib/notifications.test.ts`, replace 6 placeholder tests in `shouldCreateUserNotification` with real calls to the helper and assert on return value.
- [ ] In `service/taskDelete.test.ts`, remove the single `validatedByAction` placeholder test.
- [ ] Run `packages/backend` tests and fix any empty describe or lint issues.

### Frontend (E2E)

- [ ] Remove placeholder test in `apps/web/src/e2e/settings-form.e2e.test.ts` (tabNavigable).
- [ ] Remove two placeholder tests in `apps/web/src/e2e/file-upload.e2e.test.ts` (dragDropEnabled, previewable).

### Frontend (component tests)

- [ ] In `SettingsForm.test.tsx`, remove all placeholder-only `it` blocks (list in section 4).
- [ ] In `NotificationsList.test.tsx`, remove the nine placeholder `it` blocks.
- [ ] In `DocumentList.test.tsx`, remove the eight placeholder `it` blocks.
- [ ] Run web app tests and fix empty describe blocks if any.

### Runtime

- [ ] In `apps/runtime/src/__tests__/health-checks.test.ts`, remove the single `searchable` placeholder test.
- [ ] Run runtime tests.

### Optional

- [ ] Add `docs/quality/auth-patterns.md` documenting getCount / isSubscribed / documents.list auth contract.

### Verification

- [ ] Full repo test run (`yarn test` or equivalent) passes.
- [ ] No new lint or type errors in modified files.
