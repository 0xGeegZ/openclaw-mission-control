# Phase 2 Review: Core Backend

> Reviewer agent instructions for validating Phase 2 completion.

---

## 1. Context & Goal

This review validates that Phase 2 (Core Backend) is complete and ready for Phase 3. The reviewer must verify:

1. All backend modules are implemented correctly
2. Auth guards work as expected
3. CRUD operations work for all entities
4. Activity logging is functional
5. No type errors or lint issues

**This review MUST pass before starting Phase 3.**

---

## 2. Review Checklist

### 2.1 File Structure Verification

```bash
# Verify all module files exist
ls packages/backend/convex/
# Expected: accounts.ts, memberships.ts, tasks.ts, agents.ts, documents.ts

ls packages/backend/convex/lib/
# Expected: auth.ts, service-auth.ts, activity.ts, validators.ts, task-workflow.ts

ls packages/backend/convex/service/
# Expected: agents.ts, documents.ts
```

- [ ] `accounts.ts` exists
- [ ] `memberships.ts` exists
- [ ] `tasks.ts` exists
- [ ] `agents.ts` exists
- [ ] `documents.ts` exists
- [ ] `lib/auth.ts` exists
- [ ] `lib/service-auth.ts` exists
- [ ] `lib/activity.ts` exists
- [ ] `lib/validators.ts` exists
- [ ] `lib/task-workflow.ts` exists
- [ ] `service/agents.ts` exists
- [ ] `service/documents.ts` exists

### 2.2 Type Check

```bash
cd packages/backend
npx convex dev --once
yarn typecheck
```

- [ ] Convex dev runs without errors
- [ ] Type check passes (exit code 0)

### 2.3 Auth Guards Testing

Test auth functions work by checking exports:

```bash
# Verify auth exports
grep -E "^export (async )?function" packages/backend/convex/lib/auth.ts
# Expected: requireAuth, requireAccountMember, requireAccountAdmin, requireAccountOwner
```

- [ ] `requireAuth` exported
- [ ] `requireAccountMember` exported
- [ ] `requireAccountAdmin` exported
- [ ] `requireAccountOwner` exported

### 2.4 Accounts Module Testing

Via Convex Dashboard or test script:

```typescript
// Test account creation
const accountId = await ctx.runMutation(api.accounts.create, {
  name: "Test Account",
  slug: "test-account"
});

// Verify account exists
const account = await ctx.runQuery(api.accounts.get, { accountId });
assert(account.name === "Test Account");
```

- [ ] Create account works
- [ ] Get account returns correct data
- [ ] List accounts returns user's accounts
- [ ] Update account works (admin only)
- [ ] Slug uniqueness enforced

### 2.5 Memberships Module Testing

- [ ] List members works
- [ ] Invite member works (admin only)
- [ ] Update role works (admin only)
- [ ] Remove member works (admin only)
- [ ] Owner cannot be removed
- [ ] Leave account works (except owner)

### 2.6 Tasks Module Testing

- [ ] Create task (starts in inbox)
- [ ] Update task details
- [ ] Status transitions validate correctly
- [ ] Assign users and agents
- [ ] Delete task cascades (messages, subscriptions)
- [ ] Reopen done task works
- [ ] List by status for Kanban

### 2.7 Agents Module Testing

- [ ] Create agent with session key
- [ ] Session key format correct: `agent:{slug}:{accountId}`
- [ ] Update agent details
- [ ] Update agent status
- [ ] Get roster with current tasks
- [ ] Delete agent removes from task assignments

### 2.8 Documents Module Testing

- [ ] Create document
- [ ] Update document increments version
- [ ] Link to task works
- [ ] Search by title works
- [ ] Duplicate creates copy
- [ ] Delete removes document

### 2.9 Activity Logging Verification

Check that activities are created for mutations:

```bash
# After running tests above, verify activities exist
# Via Convex Dashboard: Browse activities table
```

- [ ] Task creation logs activity
- [ ] Task status change logs activity
- [ ] Agent creation logs activity
- [ ] Document creation logs activity

---

## 3. Integration Tests

### 3.1 Auth + Tasks Integration

```typescript
// User creates task in their account
const accountId = /* user's account */;
const taskId = await api.tasks.create({
  accountId,
  title: "Test Task"
});

// Verify task has correct accountId
const task = await api.tasks.get({ taskId });
assert(task.accountId === accountId);
```

### 3.2 Task + Agent Assignment Integration

```typescript
// Create agent
const agentId = await api.agents.create({
  accountId,
  name: "Test Agent",
  slug: "test-agent",
  role: "Tester"
});

// Assign agent to task
await api.tasks.assign({
  taskId,
  assignedAgentIds: [agentId]
});

// Verify assignment
const task = await api.tasks.get({ taskId });
assert(task.assignedAgentIds.includes(agentId));
```

### 3.3 Task Workflow Validation

```typescript
// Try invalid transition: inbox → in_progress (should fail)
try {
  await api.tasks.updateStatus({
    taskId, // task in "inbox"
    status: "in_progress"
  });
  assert(false, "Should have thrown");
} catch (e) {
  assert(e.message.includes("Invalid transition"));
}

// Valid transition: inbox → assigned (with assignee)
await api.tasks.assign({ taskId, assignedUserIds: [userId] });
await api.tasks.updateStatus({ taskId, status: "assigned" });
```

---

## 4. Review Report

Generate this report after completing all checks:

```markdown
# Phase 2 Review Report

**Date:** [YYYY-MM-DD]
**Reviewer:** [Agent or human name]

## Type Check
- [x] Pass / [ ] Fail

## Module Verification
- [x] Auth guards: Pass
- [x] Accounts: Pass
- [x] Memberships: Pass
- [x] Tasks: Pass
- [x] Agents: Pass
- [x] Documents: Pass

## Integration Tests
- [x] Auth + Tasks: Pass
- [x] Task + Agent: Pass
- [x] Workflow validation: Pass

## Activity Logging
- [x] Activities created for mutations

## Issues Found
[List any issues found and fixes applied, or "None"]

## Ready for Phase 3
- [x] YES / [ ] NO

## Notes
[Any additional observations]
```

---

## 5. Fix Common Issues

### Issue: Auth guard not found

```bash
# Check import path
grep "requireAccountMember" packages/backend/convex/tasks.ts
# Should import from "./lib/auth"
```

### Issue: Activity logging fails

```bash
# Check activity.ts stub exists and is imported
grep "logActivity" packages/backend/convex/lib/activity.ts
```

### Issue: Task workflow validation fails

```bash
# Check task-workflow.ts has correct transitions
grep "TASK_STATUS_TRANSITIONS" packages/backend/convex/lib/task-workflow.ts
```

---

## 6. Sign-off

Once all checks pass:

```bash
# Create git tag
git tag -a phase-2-complete -m "Phase 2: Core Backend complete"
```

---

## Completion Criteria

This review is complete when:

1. All 9 check sections pass
2. Integration tests pass
3. Review report shows "Ready for Phase 3: YES"
4. Git tag `phase-2-complete` created
