# Type Safety & Code Quality Standards

**Effective Date:** 2026-02-08  
**Task ID:** k97dz08a2mxvwfpcheyz8sasc980p88d

---

## Overview

This document establishes mandatory type safety and code quality standards for all OpenClaw Mission Control development. These standards support the ongoing DRY (Don't Repeat Yourself) and type safety refactoring efforts, particularly the Convex enums consolidation.

---

## 1. TypeScript Strictness

### Mandatory Configuration

All TypeScript packages use `strict: true` in their `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noUncheckedIndexedAccess": true,
    "noPropertyAccessFromIndexSignature": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "alwaysStrict": true
  }
}
```

### Required Practices

#### 1.1 Explicit Return Types

**❌ FORBIDDEN:**
```typescript
export function getTasks() {
  return tasks; // Implicit return type
}
```

**✅ REQUIRED:**
```typescript
import type { Task } from "@packages/backend/convex/lib/enums";

export function getTasks(): Task[] {
  return tasks;
}
```

#### 1.2 No `any` Type

**❌ FORBIDDEN:**
```typescript
function processData(data: any) {
  return data.value;
}
```

**✅ REQUIRED:**
```typescript
type DataValue = {
  value: string | number;
};

function processData(data: DataValue) {
  return data.value;
}
```

If a type is truly unknown, use `unknown` and narrow it:

```typescript
function process(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  throw new Error("Expected string");
}
```

#### 1.3 Explicit Parameter Types

**❌ FORBIDDEN:**
```typescript
const map = (arr, fn) => arr.map(fn);
```

**✅ REQUIRED:**
```typescript
const map = <T, U>(arr: T[], fn: (t: T) => U): U[] => arr.map(fn);
```

---

## 2. Enum & Type Consolidation (DRY Principle)

### Single Source of Truth

Enums and types are defined **once** in `packages/backend/convex/lib/enums.ts`. No duplication across backend/frontend.

### Import Rules

#### 2.1 Backend (Convex)

```typescript
// ✅ CORRECT: Import enum values
import { TASK_STATUS, AGENT_ROLES, MEMBER_ROLES } from "./lib/enums";
import type { TaskStatus, AgentRole, MemberRole } from "./lib/enums";

// Use in schema validators
const taskStatusValidator = v.union(
  v.literal('inbox'),
  v.literal('assigned'),
  v.literal('in_progress'),
  v.literal('review'),
  v.literal('done'),
  v.literal('blocked')
);
```

#### 2.2 Frontend (Next.js)

```typescript
// ✅ CORRECT: Import types from backend
import type { TaskStatus, Priority, AgentRole } from "@packages/backend/convex/lib/enums";
import { TASK_STATUS, PRIORITY_CONFIG, AGENT_ROLES } from "@packages/backend/convex/lib/enums";

// ✅ Use in components
const TaskStatusSelect = ({ value, onChange }: { value: TaskStatus; onChange: (s: TaskStatus) => void }) => {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as TaskStatus)}>
      {TASK_STATUS.map((status) => (
        <option key={status} value={status}>
          {status}
        </option>
      ))}
    </select>
  );
};

// ❌ FORBIDDEN: Never hardcode duplicate enums
const TASK_STATUSES_COPY = ['inbox', 'assigned', 'in_progress']; // WRONG!
```

### Validation Rule

Any PR that introduces a new enum/type definition outside of `packages/backend/convex/lib/enums.ts` will be **rejected** during code review.

---

## 3. ESLint Type Safety Rules

Enforce via ESLint in `apps/web/eslint.config.mjs` and similar configs:

### 3.1 No Unsafe Type Operations

| Rule | Setting | Rationale |
|------|---------|-----------|
| `@typescript-eslint/no-unsafe-assignment` | error | Prevents silent type coercion bugs |
| `@typescript-eslint/no-unsafe-member-access` | error | Disallow dynamic property access without type guards |
| `@typescript-eslint/no-unsafe-call` | error | Prevent calling potentially unsafe functions |
| `@typescript-eslint/no-unsafe-return` | error | Enforce return type consistency |

### 3.2 Consistent Type Imports

```typescript
// ❌ FORBIDDEN
import { TaskStatus } from "@packages/backend/convex/lib/enums";
const status: TaskStatus = 'inbox';

// ✅ REQUIRED
import type { TaskStatus } from "@packages/backend/convex/lib/enums";
const status: TaskStatus = 'inbox';
```

Rule: `@typescript-eslint/consistent-type-imports: ["error", { prefer: "type-only" }]`

### 3.3 Strict Boolean Expressions

```typescript
// ❌ FORBIDDEN
if (userRole) { // Could be "" or 0
  // ...
}

// ✅ REQUIRED
if (userRole !== undefined && userRole !== null) {
  // ...
}
```

Rule: `@typescript-eslint/strict-boolean-expressions: "warn"`

### 3.4 Null Safety

```typescript
// ✅ PREFERRED: Nullish coalescing
const priority = config.priority ?? 3;

// ✅ PREFERRED: Optional chaining
const value = user?.profile?.name;
```

Rules:
- `@typescript-eslint/prefer-nullish-coalescing: "warn"`
- `@typescript-eslint/prefer-optional-chain: "warn"`

---

## 4. Promise & Async Error Handling

### 4.1 No Floating Promises

**❌ FORBIDDEN:**
```typescript
async function saveTask(task: Task) {
  updateDB(task); // Promise not awaited!
}
```

**✅ REQUIRED:**
```typescript
async function saveTask(task: Task) {
  await updateDB(task);
}
```

Rule: `@typescript-eslint/no-floating-promises: "error"`

### 4.2 Promise Rejection Handling

**❌ FORBIDDEN:**
```typescript
Promise.reject("error string");
Promise.reject(123);
```

**✅ REQUIRED:**
```typescript
Promise.reject(new Error("Failed to save"));
```

Rule: `@typescript-eslint/prefer-promise-reject-errors: "error"`

---

## 5. Pre-Commit Hook Validation

**Husky + lint-staged** automatically run on `git commit`:

```bash
# Triggers automatically on commit
npm run lint -- --fix       # Fix lint issues
npm run typecheck           # Type checking
npm run test:affected       # Run affected tests
```

If any check fails, the commit is blocked. Fix and retry.

---

## 6. Code Organization & Naming Conventions

### 6.1 Where Types Go

| Category | Location | Example |
|----------|----------|---------|
| Core enums | `packages/backend/convex/lib/enums.ts` | `TaskStatus`, `Priority`, `AgentRole` |
| Domain-specific types | `packages/shared/types/*.ts` | `User`, `Team`, `Account` |
| Component-level types | Component file (with `type` prefix) | `type TaskCardProps = { ... }` |
| API types | `packages/backend/convex/types.ts` | Convex function argument/return types |

### 6.2 Naming Conventions

```typescript
// Type definitions (use PascalCase)
type TaskStatus = 'inbox' | 'assigned' | 'in_progress' | 'done';
type Priority = 1 | 2 | 3 | 4 | 5;

// Constants (use UPPER_SNAKE_CASE)
const TASK_STATUS = ['inbox', 'assigned', 'in_progress', 'done'] as const;
const PRIORITY_CONFIG = { 1: { label: 'Critical' }, ... };

// Functions (use camelCase)
function getTaskStatus(taskId: string): TaskStatus { }
const mapTasksToView = (tasks: Task[]): TaskView[] => { };

// React components (use PascalCase)
export function TaskCard({ task }: { task: Task }) { }

// Variables (use camelCase)
const currentTask: Task | null = null;
const isCompleted: boolean = task.status === 'done';
```

---

## 7. Code Review Checklist - Type Safety Section

Before approving any PR, verify:

- [ ] **TypeScript Compilation**: Run `npm run typecheck` — no errors
- [ ] **No `any` types**: Search PR diff for `any` — should be zero
- [ ] **Explicit return types**: Functions have explicit return type annotations
- [ ] **Enum imports**: Only imports from `packages/backend/convex/lib/enums.ts`
- [ ] **No duplicate types**: No new enum/type definitions outside centralized location
- [ ] **ESLint passes**: Run `npm run lint` — no errors or warnings (unless justified with comment)
- [ ] **Type-only imports**: All type imports use `import type { ... }`
- [ ] **Null safety**: Uses nullish coalescing, optional chaining, or null checks
- [ ] **No floating promises**: All async calls are awaited or explicitly handled

### Comment Template for Deviations

If a rule must be violated (rare), use:

```typescript
// @ts-expect-error: reason for deviation
const data: any = externalLibrary.getData();
```

And explain in PR comment:

```
@ts-expect-error: External library returns `any`; we validate with runtime check on line X
```

---

## 8. Documentation Standards

### 8.1 Type Documentation

```typescript
/**
 * Status of a task in the workflow.
 * @see {@link /docs/task-workflow.md} for state diagram
 * 
 * Values:
 * - inbox: New tasks, awaiting assignment
 * - assigned: Assigned to agent, awaiting start
 * - in_progress: Active work
 * - review: Submitted for review
 * - done: Completed and closed
 * - blocked: Blocked on dependency or clarification
 */
export type TaskStatus = typeof TASK_STATUS[number];
```

### 8.2 Function Documentation

```typescript
/**
 * Get all tasks assigned to a given agent.
 * 
 * @param agentId - ID of agent to fetch tasks for
 * @param options.includeBlocked - Include blocked tasks (default: false)
 * @returns Promise resolving to array of Task objects
 * @throws {UnauthorizedError} if agentId not accessible to caller
 * 
 * @example
 * const tasks = await getAgentTasks(agent.id, { includeBlocked: true });
 */
export async function getAgentTasks(
  agentId: Id<"agents">,
  options?: { includeBlocked?: boolean }
): Promise<Task[]> {
  // ...
}
```

---

## 9. Enforcement & CI Integration

### 9.1 GitHub Actions CI

Type safety validation runs on every PR push:

```yaml
type-check:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: npm ci
    - run: npm run typecheck
```

PRs cannot merge if type checks fail.

### 9.2 Pre-Commit Validation

Local validation before push (via husky + lint-staged):

```bash
husky install
npm run prepare  # Set up git hooks
```

---

## 10. Escalation & Exceptions

Type safety is a **non-negotiable requirement**. Deviations require:

1. **Code Review Consensus**: At least 2 approvals from senior engineers
2. **Documentation**: Add `@ts-expect-error` comment with detailed explanation
3. **Task Creation**: Create follow-up task to address root cause
4. **Monitoring**: Flag for next refactoring sprint

---

## References

- **Task**: Define Convex Enums & Types for Backend-Frontend Consistency (k97d2c4fmsfbsmgp2x8mzeeqxh80qbp9)
- **Linting Task**: Establish Type Safety & Code Quality Standards (k97dz08a2mxvwfpcheyz8sasc980p88d)
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/handbook/strict.html
- **ESLint TypeScript**: https://typescript-eslint.io/rules/
- **Husky**: https://typicode.github.io/husky/
