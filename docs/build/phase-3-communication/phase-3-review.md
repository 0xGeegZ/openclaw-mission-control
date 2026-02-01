# Phase 3 Review: Communication + UI Shell

> Reviewer agent instructions for validating Phase 3 completion.

---

## 1. Context & Goal

This review validates that Phase 3 (Communication + UI Shell) is complete and ready for Phase 4.

**Modules to verify:**
- Module 07: Messages & Mentions
- Module 08: Activities & Notifications  
- Module 09: UI Layout & Navigation

---

## 2. Review Checklist

### 2.1 Messages Module

```bash
ls packages/backend/convex/messages.ts
ls packages/backend/convex/subscriptions.ts
ls packages/backend/convex/lib/mentions.ts
ls packages/backend/convex/service/messages.ts
```

- [ ] `messages.ts` exists with CRUD operations
- [ ] `subscriptions.ts` exists
- [ ] `lib/mentions.ts` exists with parsing
- [ ] `service/messages.ts` exists

### 2.2 Mention Parsing Test

```typescript
// Test mention extraction
import { extractMentionStrings, hasAllMention } from "./lib/mentions";

const content = "Hey @john and @vision, check this out @all";
const mentions = extractMentionStrings(content);
assert(mentions.includes("john"));
assert(mentions.includes("vision"));
assert(hasAllMention(content) === true);
```

- [ ] Mention extraction works
- [ ] @all detection works
- [ ] Resolution finds users and agents

### 2.3 Activities & Notifications Module

```bash
ls packages/backend/convex/activities.ts
ls packages/backend/convex/notifications.ts
ls packages/backend/convex/lib/activity.ts
ls packages/backend/convex/lib/notifications.ts
ls packages/backend/convex/service/notifications.ts
```

- [ ] `activities.ts` exists with queries
- [ ] `notifications.ts` exists with CRUD
- [ ] `lib/activity.ts` upgraded from stub
- [ ] `lib/notifications.ts` exists
- [ ] `service/notifications.ts` exists

### 2.4 Activity Feed Test

```typescript
// Create a task and verify activity is logged
const taskId = await api.tasks.create({ accountId, title: "Test" });
const activities = await api.activities.list({ accountId, limit: 1 });
assert(activities[0].type === "task_created");
```

- [ ] Activities created on mutations
- [ ] Activity feed returns correct data
- [ ] Filter by type works

### 2.5 Notifications Test

```typescript
// Create message with mention, verify notification
const messageId = await api.messages.create({
  taskId,
  content: "Hey @agent-name check this"
});

// Verify notification created
const notifications = await api.service.notifications.listUndeliveredForAccount({
  accountId
});
assert(notifications.length > 0);
```

- [ ] Mention creates notification
- [ ] Thread subscribers get notifications
- [ ] Mark read works
- [ ] Service functions work

### 2.6 UI Layout Verification

```bash
ls apps/web/components/dashboard/
# Expected: Sidebar.tsx, AccountSwitcher.tsx, NotificationBell.tsx, MobileNav.tsx

ls apps/web/app/\(dashboard\)/
# Expected: layout.tsx, page.tsx, [accountSlug]/
```

- [ ] Sidebar component exists
- [ ] AccountSwitcher component exists
- [ ] NotificationBell component exists
- [ ] MobileNav component exists
- [ ] Dashboard layout exists
- [ ] Account layout exists

### 2.7 UI Smoke Test

```bash
npm run dev
# Visit http://localhost:3000
```

- [ ] Landing page renders
- [ ] Sign in works (Clerk)
- [ ] Dashboard layout renders
- [ ] Sidebar navigation works
- [ ] Account switcher works
- [ ] Mobile nav works on small screen

### 2.8 Type Check

```bash
npm run typecheck
```

- [ ] Backend type check passes
- [ ] Frontend type check passes

---

## 3. Integration Tests

### 3.1 Message → Activity → Notification Flow

```typescript
// Full flow test
// 1. Create message with mention
// 2. Verify activity created
// 3. Verify notification created
// 4. Verify subscriber notification
```

- [ ] Flow works end-to-end

### 3.2 UI → Backend Integration

- [ ] Notification count updates in real-time
- [ ] Activity feed updates in real-time

---

## 4. Review Report

```markdown
# Phase 3 Review Report

**Date:** [YYYY-MM-DD]
**Reviewer:** [Agent or human]

## Backend Modules
- [x] Messages: Pass
- [x] Activities: Pass
- [x] Notifications: Pass

## UI Components
- [x] Sidebar: Pass
- [x] Account Switcher: Pass
- [x] Notification Bell: Pass
- [x] Mobile Nav: Pass

## Integration Tests
- [x] Message flow: Pass
- [x] Real-time updates: Pass

## Type Check
- [x] Pass

## Issues Found
[None or list]

## Ready for Phase 4
- [x] YES
```

---

## 5. Sign-off

```bash
git tag -a phase-3-complete -m "Phase 3: Communication + UI Shell complete"
```

---

## Completion Criteria

This review is complete when:

1. All module files exist
2. Mention parsing works
3. Notifications created correctly
4. UI layout renders
5. Type check passes
6. Git tag created
