# Phase 4 Review: Feature UI + Runtime

> Reviewer agent instructions for validating Phase 4 (final phase) completion.

---

## 1. Context & Goal

This review validates that Phase 4 (Feature UI + Runtime) is complete. This is the final phase.

**Modules to verify:**
- Module 10: UI Kanban Board
- Module 11: UI Task Detail
- Module 12: UI Agents & Activity Feed
- Module 13: Runtime Service

---

## 2. Review Checklist

### 2.1 Kanban Board

```bash
ls apps/web/components/tasks/
# Expected: KanbanBoard.tsx, KanbanColumn.tsx, TaskCard.tsx, CreateTaskDialog.tsx
```

- [ ] KanbanBoard component exists
- [ ] TaskCard component exists
- [ ] Drag-and-drop works
- [ ] Create task dialog works
- [ ] Real-time updates work

### 2.2 Task Detail

```bash
ls apps/web/app/\(dashboard\)/\[accountSlug\]/tasks/\[taskId\]/
# Expected: page.tsx
```

- [ ] Task detail page exists
- [ ] Message thread displays
- [ ] Can send messages
- [ ] Mention autocomplete works
- [ ] Documents tab works

### 2.3 Agents & Activity

```bash
ls apps/web/components/agents/
ls apps/web/components/feed/
```

- [ ] Agent roster displays
- [ ] Agent status shows correctly
- [ ] Create agent works
- [ ] Activity feed displays
- [ ] Real-time updates work

### 2.4 Runtime Service

```bash
ls apps/runtime/src/
# Expected: index.ts, config.ts, convex-client.ts, gateway.ts, delivery.ts, heartbeat.ts, health.ts
```

- [ ] Entry point exists
- [ ] Configuration loads from env
- [ ] Convex client connects
- [ ] Delivery loop implemented
- [ ] Heartbeat scheduler implemented
- [ ] Health endpoint responds
- [ ] Dockerfile exists

### 2.5 Type Check

```bash
npm run typecheck
```

- [ ] All packages pass type check

### 2.6 Build Check

```bash
npm run build
```

- [ ] Web app builds successfully
- [ ] Runtime builds successfully

---

## 3. End-to-End Testing

### 3.1 Full User Flow

1. Sign in with Clerk
2. Create or select account
3. Navigate to Tasks (Kanban)
4. Create a new task
5. Drag task to "Assigned" (with assignee)
6. View task detail
7. Send a message with @mention
8. Check notification bell updates
9. View activity feed
10. View agents roster

- [ ] All steps complete without errors

### 3.2 Runtime Flow (Manual/Mock)

1. Runtime starts
2. Connects to Convex
3. Fetches undelivered notifications
4. Would deliver to OpenClaw (mock)
5. Marks delivered
6. Health endpoint responds

- [ ] Runtime flow works

---

## 4. Integration Verification

### 4.1 Real-time Updates

- [ ] Create task → appears on Kanban instantly
- [ ] Send message → appears in thread instantly
- [ ] Status change → card moves on Kanban

### 4.2 Notification Flow

- [ ] @mention creates notification
- [ ] Notification count updates
- [ ] Click notification → navigates to task

### 4.3 Agent Integration

- [ ] Agent created → appears in roster
- [ ] Agent status shows (mock online for now)
- [ ] Agent assigned to task → shows on task card

---

## 5. Final Review Report

```markdown
# Phase 4 Review Report (Final)

**Date:** [YYYY-MM-DD]
**Reviewer:** [Agent or human]

## UI Components
- [x] Kanban Board: Pass
- [x] Task Detail: Pass
- [x] Agent Roster: Pass
- [x] Activity Feed: Pass

## Runtime Service
- [x] Configuration: Pass
- [x] Convex Client: Pass
- [x] Delivery Loop: Pass
- [x] Heartbeat: Pass
- [x] Health Endpoint: Pass

## Type Check
- [x] Pass

## Build
- [x] Pass

## E2E Testing
- [x] User flow: Pass
- [x] Real-time: Pass
- [x] Notifications: Pass

## Issues Found
[None or list]

## Project Status
- [x] COMPLETE
```

---

## 6. Project Sign-off

```bash
# Create final tag
git tag -a phase-4-complete -m "Phase 4: Feature UI + Runtime complete"
git tag -a v1.0.0 -m "Mission Control v1.0.0 - Initial Release"

# Push tags (if using remote)
git push origin --tags
```

---

## 7. Post-Completion Checklist

### Documentation
- [ ] README.md updated with setup instructions
- [ ] AGENTS.md exists with operating manual
- [ ] HEARTBEAT.md exists with wake checklist
- [ ] SOUL_TEMPLATE.md exists

### Deployment Preparation
- [ ] Environment variables documented
- [ ] Convex production deployment documented
- [ ] Vercel deployment documented
- [ ] DigitalOcean droplet provisioning documented

### Testing
- [ ] Basic unit tests exist
- [ ] Integration test for key flow exists
- [ ] Manual QA checklist completed

---

## Completion Criteria

This review (and the entire project) is complete when:

1. All 4 phases pass their reviews
2. Full E2E flow works
3. Type check and build pass
4. Documentation complete
5. Ready for production deployment

---

## Congratulations!

If you've reached this point and all checks pass, Mission Control v1.0 is complete!

Next steps:
1. Deploy Convex to production
2. Deploy web app to Vercel
3. Provision first customer runtime (DigitalOcean)
4. Onboard first agents
5. Start collaborating!
