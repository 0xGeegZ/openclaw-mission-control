# Align delivery context IDs (remove unknown cast) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align ID types between the backend `GetForDeliveryResult` and the runtime `DeliveryContext` so the runtime can use the action result without casting through `unknown`.

**Architecture:** The backend `getForDelivery` returns `GetForDeliveryResult`; the runtime currently casts it to `DeliveryContext` with `as unknown as DeliveryContext` because `mentionableAgents[].id` and `assignedAgents[].id` are typed as `string` in the backend but as `Id<"agents">` in the runtime. The values are already agent document IDs (`a._id`). Fix the backend type to use `Id<"agents">` so both types are structurally compatible; then remove the double cast in the runtime.

**Tech Stack:** TypeScript, Convex (backend), Node runtime (apps/runtime).

---

## Root cause

- **Backend** `packages/backend/convex/service/notifications.ts`: `GetForDeliveryResult.mentionableAgents[].id` and `assignedAgents[].id` are declared as `string`.
- **Runtime** `apps/runtime/src/delivery/types.ts`: `DeliveryContext.mentionableAgents[].id` and `assignedAgents[].id` are `Id<"agents">`.
- **Backend implementation** (same file, ~504–520): Values are `a._id` (from `Doc<"agents">`), i.e. already `Id<"agents">`. So the backend type is wrong, not the runtime.

---

### Task 1: Backend — Use Id<"agents"> in GetForDeliveryResult

**Files:**

- Modify: `packages/backend/convex/service/notifications.ts` (interface and any typed consumers)

**Step 1: Update GetForDeliveryResult interface**

In `packages/backend/convex/service/notifications.ts`, change the `GetForDeliveryResult` interface so that `mentionableAgents` and `assignedAgents` use `Id<"agents">` for `id`:

```ts
// Before (lines ~33–44):
mentionableAgents: Array<{
  id: string;
  slug: string;
  name: string;
  role: string;
}>;
assignedAgents: Array<{
  id: string;
  slug: string;
  name: string;
  role: string;
}>;

// After:
mentionableAgents: Array<{
  id: Id<"agents">;
  slug: string;
  name: string;
  role: string;
}>;
assignedAgents: Array<{
  id: Id<"agents">;
  slug: string;
  name: string;
  role: string;
}>;
```

No implementation change: the code already assigns `a._id` (Id<"agents">) to `id`.

**Step 2: Run backend typecheck**

Run: `cd packages/backend && npx tsc --noEmit -p convex`  
Expected: PASS (no errors).

**Step 3: Commit**

```bash
git add packages/backend/convex/service/notifications.ts
git commit -m "fix(backend): type mentionableAgents/assignedAgents id as Id<agents> in GetForDeliveryResult"
```

---

### Task 2: Runtime — Use GetForDeliveryResult as DeliveryContext (remove cast)

**Files:**

- Modify: `apps/runtime/src/delivery.ts` (single boundary where context is used)

**Step 1: Remove double cast and use direct assignment**

In `apps/runtime/src/delivery.ts`:

- Locate the block that does:
  - `const deliveryContext = context as GetForDeliveryResult | null;`
  - `if (deliveryContext?.agent) {`
  - `const ctx: DeliveryContext = deliveryContext as unknown as DeliveryContext;`
- Replace so that after the null/agent check we assign the backend result directly to `ctx` with type `DeliveryContext`, with no cast (or a single assertion if the type system still needs a nudge).

Because after Task 1 the shapes are aligned, you can either:

- Option A: Type `ctx` as `DeliveryContext` and assign `deliveryContext` (TypeScript should accept it if structures match).
- Option B: If the runtime still uses a separate `DeliveryContext` type that is intentionally a subset, keep one assignment and use a single cast: `const ctx: DeliveryContext = deliveryContext` (no `as unknown as`).

Target code after edit:

```ts
const deliveryContext = context as GetForDeliveryResult | null;
if (deliveryContext?.agent) {
  const ctx: DeliveryContext = deliveryContext;
  // ... rest unchanged
```

If TypeScript still reports a mismatch (e.g. Doc<"notifications"> vs inline notification shape), then the only remaining difference is nominal (Doc vs inline). In that case use a single assertion:

```ts
const ctx = deliveryContext as DeliveryContext;
```

and remove the comment about "id as string" / "Structurally compatible".

**Step 2: Run runtime typecheck and tests**

Run: `cd apps/runtime && npm run typecheck`  
Expected: PASS.

Run: `cd apps/runtime && npm test`  
Expected: All tests pass (delivery, delivery-loop, policy, etc.).

**Step 3: Commit**

```bash
git add apps/runtime/src/delivery.ts
git commit -m "fix(runtime): use GetForDeliveryResult as DeliveryContext without unknown cast"
```

---

### Task 3: Optional — Single source of type (backend as source of truth)

**Files:**

- Modify: `apps/runtime/src/delivery/types.ts`
- Modify: `apps/runtime/src/delivery.ts` (import)
- Consider: `apps/runtime/src/delivery/policy.ts`, `delivery/prompt.ts`, tests (if they depend on DeliveryContext name)

**Goal:** If desired, make the runtime use the backend type as the single source of truth so there is no duplicate type definition.

**Step 1: Re-export backend type as DeliveryContext**

In `apps/runtime/src/delivery/types.ts`, replace the local `DeliveryContext` interface with a re-export of the backend type:

```ts
/**
 * Delivery context shape from getNotificationForDelivery (Convex service).
 * Re-exported from backend so IDs and shape stay in sync; no cast at boundary.
 */
export type { GetForDeliveryResult as DeliveryContext } from "@packages/backend/convex/service/notifications";
```

Remove the local interface and any duplicate field definitions. Ensure `apps/runtime` can import from `@packages/backend/convex/service/notifications` (it already does in delivery.ts).

**Step 2: Fix imports**

- In `delivery/types.ts`: the re-export may require a type-only import: `import type { GetForDeliveryResult } from "..."` then `export type DeliveryContext = GetForDeliveryResult`.
- In `delivery.ts`: remove the cast entirely; `ctx` is already `GetForDeliveryResult` (or `DeliveryContext` alias). All consumers of `DeliveryContext` (policy, prompt, tests) keep using the name `DeliveryContext`; they now get the backend shape.

**Step 3: Run typecheck and tests**

Run: `cd apps/runtime && npm run typecheck && npm test`  
Expected: PASS.

**Step 4: Commit (optional)**

```bash
git add apps/runtime/src/delivery/types.ts apps/runtime/src/delivery.ts
git commit -m "refactor(runtime): use GetForDeliveryResult as DeliveryContext single source of truth"
```

---

## Verification (after all tasks)

- From repo root: `npm run typecheck` — PASS.
- From repo root: `cd apps/runtime && npm test` — all pass.
- From repo root: `cd packages/backend && npm test` — all pass.
- In `apps/runtime/src/delivery.ts`: no `as unknown as DeliveryContext`; at most one direct assignment or single assertion.

---

## Summary

| Task         | Change                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 1            | Backend: `GetForDeliveryResult.mentionableAgents[].id` and `assignedAgents[].id` → `Id<"agents">`.                        |
| 2            | Runtime: Remove `as unknown as DeliveryContext`; assign `deliveryContext` to `ctx` (and drop obsolete comment).           |
| 3 (optional) | Runtime: Define `DeliveryContext` as alias of `GetForDeliveryResult` in `delivery/types.ts` for a single source of truth. |
