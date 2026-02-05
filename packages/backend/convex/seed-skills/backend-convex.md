# Backend Convex

Use this skill when working with the Convex backend: schema, queries, mutations, auth guards, and indexes. Follow project patterns in `packages/backend/convex`.

## Multi-tenancy (critical)

- Every table except `accounts` has `accountId`.
- Every query and mutation must scope by `accountId`. No cross-account data access.
- Use `requireAccountMember(ctx, accountId)` (or `requireAccountAdmin` when needed) at the start of user-facing handlers to enforce membership and get `accountId` in scope.

## Auth

- **User-facing:** `requireAuth(ctx)` for identity only; `requireAccountMember(ctx, accountId)` for identity + account membership. Both throw on failure.
- **Service / runtime:** Use `convex/service/*` and service auth tokens; do not use user identity in those paths.
- Identity comes from Clerk via `ctx.auth.getUserIdentity()`; use `lib/auth.ts` helpers only.

## Schema and validators

- Define tables in `schema.ts` with `defineSchema` and `defineTable`. Use `v` from `convex/values` for all fields.
- Shared union validators (e.g. task status, agent status) live in `lib/validators.ts` and are reused in schema and args.
- Define an index for every query pattern; avoid full table scans. Use `.index("by_account", ["accountId"])` and compound indexes like `["accountId", "status"]` as needed.

## Queries and mutations

- Always use `.withIndex()` for queries; match the index fields to the filter (e.g. `by_account`, `by_account_status`, `by_account_user`).
- Use `.unique()` for at-most-one results, `.first()` or `.collect()` for lists. Prefer indexing over `.filter()` on large sets.
- Use `internalQuery` / `internalMutation` for server-only callers (e.g. standup, cron); use `query` / `mutation` for the HTTP/API surface and always guard with auth.
- Await all async work (e.g. `ctx.scheduler.runAfter`, `ctx.db.patch`) to avoid floating promises.

## Activity and notifications

- Log meaningful state changes with `logActivity` from `lib/activity.ts` (e.g. task status, assignments, doc updates).
- Use helpers in `lib/notifications.ts` for creating notifications (mentions, assignments, status changes). Notifications are consumed by the runtime for delivery.

## Conventions

- **File naming:** snake_case for all files under `convex/` (e.g. `tasks.ts`, `seed_skills_build.ts`).
- **Imports:** Use `api` from `_generated/api`, `Id`/`Doc` from `_generated/dataModel`, and server types from `_generated/server`.
- **Args:** Validate all arguments with `v.*` validators; reuse shared validators from `lib/validators.ts` where applicable.

## References

- Convex docs: [Schemas](https://docs.convex.dev/database/schemas), [Indexes](https://docs.convex.dev/database/reading-data/indexes), [Best practices](https://docs.convex.dev/production/best-practices).
- Project: `packages/backend/convex/README.md`, `convex/schema.ts`, `convex/lib/auth.ts`.
