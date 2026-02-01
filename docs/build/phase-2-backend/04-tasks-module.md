# Module 04: Tasks Module

> Implement task management with Kanban workflow.

---

## ESSENTIAL CONTEXT — READ FIRST

**Before implementing this module, you MUST read:**

1. **`docs/mission-control-initial-article.md`** — Task lifecycle (Section 11)
2. **`docs/mission-control-cursor-core-instructions.md`** — Task workflow invariants (Section 4.4)
3. **`.cursor/rules/05-convex.mdc`** — Convex mutation patterns

**Key workflow:**
```
inbox → assigned → in_progress → review → done
           ↓            ↓
        blocked ←────────┘
```

**Invariants:**
- **W1:** Status transitions validated server-side
- **W2:** `assigned` requires at least one assignee
- **L1:** All state changes logged to `activities`

---

## 1. Context & Goal

We are implementing the task management system for Mission Control's Kanban board. This module provides:

- **Task CRUD**: Create, read, update, delete tasks
- **Workflow management**: Status transitions with validation
- **Assignment**: Assign users and agents to tasks
- **Filtering/sorting**: Query tasks by status, priority, assignee

**What we're building:**
- Task queries: list, get, filter by status
- Task mutations: create, update, updateStatus, assign, delete
- Status transition validation
- Real-time subscriptions for Kanban board

**Key constraints:**
- All tasks scoped to `accountId`
- Status transitions must follow defined workflow
- Assigned tasks must have at least one assignee
- All state changes logged to activities

---

## 2. Codebase Research Summary

### Files to Reference

- `packages/backend/convex/schema.ts` - Tasks table definition
- `packages/shared/src/types/index.ts` - TaskStatus type
- `packages/shared/src/constants/index.ts` - TASK_STATUS_TRANSITIONS
- `packages/backend/convex/lib/auth.ts` - Auth guards (from Module 03)
- `packages/backend/convex/lib/validators.ts` - taskStatusValidator

### Task Status Workflow

```
inbox → assigned → in_progress → review → done
           ↓            ↓
        blocked ←────────┘
           ↓
        assigned OR in_progress (unblock)
```

### Schema Reference

```typescript
tasks: defineTable({
  accountId: v.id("accounts"),
  title: v.string(),
  description: v.optional(v.string()),
  status: taskStatusValidator,
  priority: v.number(),
  assignedUserIds: v.array(v.string()),
  assignedAgentIds: v.array(v.id("agents")),
  labels: v.array(v.string()),
  dueDate: v.optional(v.number()),
  blockedReason: v.optional(v.string()),
  createdBy: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
```

---

## 3. High-level Design

### Data Flow

```
User action → Mutation → Validate → Update DB → Log activity → Return result
                 ↓
              Real-time subscription updates UI
```

### Status Transition Logic

```typescript
// Valid transitions
TASK_STATUS_TRANSITIONS = {
  inbox: ["assigned"],
  assigned: ["in_progress", "blocked"],
  in_progress: ["review", "blocked"],
  review: ["done", "in_progress"],
  done: [],
  blocked: ["assigned", "in_progress"],
};

// Validation rules
- "assigned" requires at least one assignee
- "blocked" requires blockedReason
- Cannot transition from "done" (must reopen first)
```

---

## 4. File & Module Changes

### Files to Create

| Path | Purpose |
|------|---------|
| `packages/backend/convex/tasks.ts` | Task CRUD operations |
| `packages/backend/convex/lib/task-workflow.ts` | Workflow validation helpers |

---

## 5. Step-by-Step Tasks

### Step 1: Create Workflow Validation Helpers

Create `packages/backend/convex/lib/task-workflow.ts`:

```typescript
import { Id } from "../_generated/dataModel";

/**
 * Task status type.
 */
export type TaskStatus = 
  | "inbox"
  | "assigned"
  | "in_progress"
  | "review"
  | "done"
  | "blocked";

/**
 * Valid status transitions.
 * Maps current status to array of allowed next statuses.
 */
export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  inbox: ["assigned"],
  assigned: ["in_progress", "blocked"],
  in_progress: ["review", "blocked"],
  review: ["done", "in_progress"],
  done: [], // Cannot transition from done
  blocked: ["assigned", "in_progress"],
};

/**
 * Ordered list of statuses for Kanban columns.
 */
export const TASK_STATUS_ORDER: TaskStatus[] = [
  "inbox",
  "assigned",
  "in_progress",
  "review",
  "done",
];

/**
 * Check if a status transition is valid.
 * 
 * @param currentStatus - Current task status
 * @param nextStatus - Proposed next status
 * @returns True if transition is allowed
 */
export function isValidTransition(
  currentStatus: TaskStatus,
  nextStatus: TaskStatus
): boolean {
  const allowed = TASK_STATUS_TRANSITIONS[currentStatus];
  return allowed.includes(nextStatus);
}

/**
 * Validate status transition requirements.
 * Returns error message if invalid, null if valid.
 * 
 * @param nextStatus - Proposed next status
 * @param hasAssignees - Whether task has assignees
 * @param blockedReason - Blocked reason (if transitioning to blocked)
 * @returns Error message or null
 */
export function validateStatusRequirements(
  nextStatus: TaskStatus,
  hasAssignees: boolean,
  blockedReason?: string
): string | null {
  // "assigned" requires at least one assignee
  if (nextStatus === "assigned" && !hasAssignees) {
    return "Cannot move to 'assigned' without at least one assignee";
  }
  
  // "in_progress" requires at least one assignee
  if (nextStatus === "in_progress" && !hasAssignees) {
    return "Cannot move to 'in_progress' without at least one assignee";
  }
  
  // "blocked" requires a reason
  if (nextStatus === "blocked" && !blockedReason) {
    return "Cannot move to 'blocked' without providing a reason";
  }
  
  return null;
}

/**
 * Get human-readable label for status.
 */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: "Inbox",
  assigned: "Assigned",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
};
```

### Step 2: Create Tasks Module

Create `packages/backend/convex/tasks.ts`:

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAccountMember } from "./lib/auth";
import { taskStatusValidator } from "./lib/validators";
import { 
  isValidTransition, 
  validateStatusRequirements,
  TaskStatus,
  TASK_STATUS_ORDER,
} from "./lib/task-workflow";
import { logActivity } from "./lib/activity";

/**
 * List tasks for an account.
 * Supports filtering by status and sorting.
 */
export const list = query({
  args: {
    accountId: v.id("accounts"),
    status: v.optional(taskStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    let tasksQuery = ctx.db
      .query("tasks")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId));
    
    const tasks = await tasksQuery.collect();
    
    // Filter by status if provided
    let filteredTasks = args.status 
      ? tasks.filter(t => t.status === args.status)
      : tasks;
    
    // Sort by priority (lower = higher priority) then by createdAt
    filteredTasks.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return b.createdAt - a.createdAt;
    });
    
    // Apply limit
    if (args.limit) {
      filteredTasks = filteredTasks.slice(0, args.limit);
    }
    
    return filteredTasks;
  },
});

/**
 * List tasks grouped by status (for Kanban board).
 * Returns tasks organized into columns.
 */
export const listByStatus = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    
    // Group by status
    const grouped: Record<TaskStatus, typeof tasks> = {
      inbox: [],
      assigned: [],
      in_progress: [],
      review: [],
      done: [],
      blocked: [],
    };
    
    for (const task of tasks) {
      grouped[task.status as TaskStatus].push(task);
    }
    
    // Sort each group by priority then createdAt
    for (const status of Object.keys(grouped) as TaskStatus[]) {
      grouped[status].sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return b.createdAt - a.createdAt;
      });
    }
    
    return {
      columns: TASK_STATUS_ORDER,
      tasks: grouped,
    };
  },
});

/**
 * Get a single task by ID.
 */
export const get = query({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      return null;
    }
    
    await requireAccountMember(ctx, task.accountId);
    return task;
  },
});

/**
 * Get tasks assigned to a specific agent.
 */
export const listByAgent = query({
  args: {
    accountId: v.id("accounts"),
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    
    return tasks.filter(t => t.assignedAgentIds.includes(args.agentId));
  },
});

/**
 * Create a new task.
 */
export const create = mutation({
  args: {
    accountId: v.id("accounts"),
    title: v.string(),
    description: v.optional(v.string()),
    priority: v.optional(v.number()),
    labels: v.optional(v.array(v.string())),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, userName } = await requireAccountMember(ctx, args.accountId);
    
    const now = Date.now();
    
    const taskId = await ctx.db.insert("tasks", {
      accountId: args.accountId,
      title: args.title,
      description: args.description,
      status: "inbox",
      priority: args.priority ?? 3, // Default medium priority
      assignedUserIds: [],
      assignedAgentIds: [],
      labels: args.labels ?? [],
      dueDate: args.dueDate,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    
    // Log activity
    await logActivity({
      ctx,
      accountId: args.accountId,
      type: "task_created",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "task",
      targetId: taskId,
      targetName: args.title,
    });
    
    return taskId;
  },
});

/**
 * Update task details (not status).
 */
export const update = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    priority: v.optional(v.number()),
    labels: v.optional(v.array(v.string())),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }
    
    const { userId, userName } = await requireAccountMember(ctx, task.accountId);
    
    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };
    
    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.priority !== undefined) updates.priority = args.priority;
    if (args.labels !== undefined) updates.labels = args.labels;
    if (args.dueDate !== undefined) updates.dueDate = args.dueDate;
    
    await ctx.db.patch(args.taskId, updates);
    
    // Log activity
    await logActivity({
      ctx,
      accountId: task.accountId,
      type: "task_updated",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "task",
      targetId: args.taskId,
      targetName: args.title ?? task.title,
      meta: { updates: Object.keys(updates).filter(k => k !== "updatedAt") },
    });
    
    return args.taskId;
  },
});

/**
 * Update task status with workflow validation.
 */
export const updateStatus = mutation({
  args: {
    taskId: v.id("tasks"),
    status: taskStatusValidator,
    blockedReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }
    
    const { userId, userName } = await requireAccountMember(ctx, task.accountId);
    
    const currentStatus = task.status as TaskStatus;
    const nextStatus = args.status as TaskStatus;
    
    // Validate transition
    if (!isValidTransition(currentStatus, nextStatus)) {
      throw new Error(
        `Invalid transition: Cannot move from '${currentStatus}' to '${nextStatus}'`
      );
    }
    
    // Validate requirements
    const hasAssignees = 
      task.assignedUserIds.length > 0 || task.assignedAgentIds.length > 0;
    const requirementError = validateStatusRequirements(
      nextStatus,
      hasAssignees,
      args.blockedReason
    );
    
    if (requirementError) {
      throw new Error(`Invalid status change: ${requirementError}`);
    }
    
    // Build updates
    const updates: Record<string, unknown> = {
      status: nextStatus,
      updatedAt: Date.now(),
    };
    
    // Set or clear blocked reason
    if (nextStatus === "blocked") {
      updates.blockedReason = args.blockedReason;
    } else if (currentStatus === "blocked") {
      updates.blockedReason = undefined;
    }
    
    await ctx.db.patch(args.taskId, updates);
    
    // Log activity
    await logActivity({
      ctx,
      accountId: task.accountId,
      type: "task_status_changed",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "task",
      targetId: args.taskId,
      targetName: task.title,
      meta: { 
        oldStatus: currentStatus, 
        newStatus: nextStatus,
        blockedReason: args.blockedReason,
      },
    });
    
    return args.taskId;
  },
});

/**
 * Assign users and/or agents to a task.
 */
export const assign = mutation({
  args: {
    taskId: v.id("tasks"),
    assignedUserIds: v.optional(v.array(v.string())),
    assignedAgentIds: v.optional(v.array(v.id("agents"))),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }
    
    const { userId, userName } = await requireAccountMember(ctx, task.accountId);
    
    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };
    
    if (args.assignedUserIds !== undefined) {
      updates.assignedUserIds = args.assignedUserIds;
    }
    
    if (args.assignedAgentIds !== undefined) {
      // Validate agents exist and belong to account
      for (const agentId of args.assignedAgentIds) {
        const agent = await ctx.db.get(agentId);
        if (!agent || agent.accountId !== task.accountId) {
          throw new Error(`Invalid agent: ${agentId}`);
        }
      }
      updates.assignedAgentIds = args.assignedAgentIds;
    }
    
    await ctx.db.patch(args.taskId, updates);
    
    // Log activity
    await logActivity({
      ctx,
      accountId: task.accountId,
      type: "task_updated",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "task",
      targetId: args.taskId,
      targetName: task.title,
      meta: { 
        assignedUserIds: args.assignedUserIds,
        assignedAgentIds: args.assignedAgentIds,
      },
    });
    
    // TODO: Create notifications for new assignees (Module 08)
    
    return args.taskId;
  },
});

/**
 * Delete a task.
 * Also deletes associated messages and subscriptions.
 */
export const remove = mutation({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }
    
    const { userId, userName } = await requireAccountMember(ctx, task.accountId);
    
    // Delete associated messages
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    
    for (const message of messages) {
      await ctx.db.delete(message._id);
    }
    
    // Delete associated subscriptions
    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    
    for (const subscription of subscriptions) {
      await ctx.db.delete(subscription._id);
    }
    
    // Delete task
    await ctx.db.delete(args.taskId);
    
    // Note: Don't log delete activity since task is gone
    // Could log to a separate audit log if needed
    
    return true;
  },
});

/**
 * Reopen a done task (move back to review).
 * Special case since "done" has no outgoing transitions.
 */
export const reopen = mutation({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }
    
    if (task.status !== "done") {
      throw new Error("Invalid operation: Can only reopen done tasks");
    }
    
    const { userId, userName } = await requireAccountMember(ctx, task.accountId);
    
    await ctx.db.patch(args.taskId, {
      status: "review",
      updatedAt: Date.now(),
    });
    
    // Log activity
    await logActivity({
      ctx,
      accountId: task.accountId,
      type: "task_status_changed",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "task",
      targetId: args.taskId,
      targetName: task.title,
      meta: { oldStatus: "done", newStatus: "review", reopened: true },
    });
    
    return args.taskId;
  },
});
```

### Step 3: Verify Build

```bash
cd packages/backend
npx convex dev --once
yarn typecheck
```

### Step 4: Commit Changes

```bash
git add .
git commit -m "feat(tasks): implement task management with Kanban workflow

- Add task CRUD operations
- Implement status transition validation
- Add workflow validation helpers
- Support task assignment to users and agents
- Add listByStatus for Kanban board
"
```

---

## 6. Edge Cases & Risks

### Edge Cases

| Case | Handling |
|------|----------|
| Invalid status transition | Throw with clear error message |
| Assign without assignees | Block transition to assigned/in_progress |
| Block without reason | Require blockedReason field |
| Delete task with messages | Cascade delete messages and subscriptions |
| Reopen done task | Special `reopen` mutation |

### Concurrent Updates

- Convex handles optimistic locking
- UI should handle conflicts gracefully
- Consider adding version field for complex scenarios

---

## 7. Testing Strategy

### Manual Verification

- [ ] Create task (appears in inbox)
- [ ] Update task title/description
- [ ] Assign task (valid agents only)
- [ ] Transition inbox → assigned (fails without assignee)
- [ ] Transition to blocked (requires reason)
- [ ] Reopen done task
- [ ] Delete task (cascades)

### Queries to Test

- [ ] `list` returns correct tasks for account
- [ ] `listByStatus` groups correctly
- [ ] `listByAgent` filters correctly

---

## 8. Rollout / Migration

Not applicable for initial implementation.

---

## 9. TODO Checklist

### Workflow Helpers

- [ ] Create `lib/task-workflow.ts`
- [ ] Implement `isValidTransition`
- [ ] Implement `validateStatusRequirements`
- [ ] Define status order and labels

### Tasks Module

- [ ] Create `tasks.ts`
- [ ] Implement `list` query
- [ ] Implement `listByStatus` query
- [ ] Implement `get` query
- [ ] Implement `listByAgent` query
- [ ] Implement `create` mutation
- [ ] Implement `update` mutation
- [ ] Implement `updateStatus` mutation
- [ ] Implement `assign` mutation
- [ ] Implement `remove` mutation
- [ ] Implement `reopen` mutation

### Verification

- [ ] Type check passes
- [ ] Test task creation
- [ ] Test status transitions
- [ ] Commit changes

---

## Completion Criteria

This module is complete when:

1. All task queries and mutations implemented
2. Status transitions validated correctly
3. Assignment validation works
4. Activities logged for all changes
5. Type check passes
6. Git commit made
