# Code Review: Notifications Popover & Load More

**Scope:** Local changes for notifications popover, load-more pagination, redirect page, and QA checklist.

**Files touched:**

- `apps/web/src/components/dashboard/NotificationBell.tsx` (modified)
- `apps/web/src/app/(dashboard)/[accountSlug]/notifications/page.tsx` (replaced with redirect)
- `docs/quality/qa-checklist.md` (updated)
- Plan and env files (not reviewed here)

---

## 1. Understand the change

- **NotificationBell:** Notifications moved from a dedicated page into a popover. Features: unread badge, All/Unread filter, list with auto mark-as-read when visible, per-item dismiss, “Mark all read”, and **Load more** with cursor-based pagination.
- **Notifications route:** Replaced full-page list with a server component that redirects `/[accountSlug]/notifications` → `/[accountSlug]/tasks` so old links and bookmarks don’t 404.
- **Pagination:** First page from `api.notifications.list` (no cursor). “Load more” sets `cursorToFetch`; a second `useQuery` runs with that cursor; on result, the effect appends the page to `accumulatedMore` via `queueMicrotask` and clears `cursorToFetch`. Pagination state is reset when the popover closes or the filter changes.

---

## 2. Review checklist

### Functionality

- [x] **Intended behavior:** Popover shows notifications; filter, mark read (auto + all), dismiss, and load more work as designed.
- [x] **Edge cases:** Empty list and loading states are handled. Filter/popover close reset pagination. “Load more” is disabled while loading; `nextCursor` hides the button when there are no more pages.
- [ ] **Error handling:** Mutations (`markAsRead`, `markAllAsRead`, `remove`) have no `try/catch` or user feedback. A failed mutation (e.g. network) leaves the user with no indication. **Suggestion:** Follow existing patterns (e.g. `KanbanBoard.tsx`, `TaskHeader.tsx`) and use `toast.error("…")` in mutation catch blocks and optionally `toast.success` for “Mark all read” / dismiss.

### Code quality

- [x] **Structure:** Clear split between hook (`useMarkReadWhenVisible`), wrapper (`NotificationRowWrapper`), and main component. Pagination state and handlers are grouped.
- [x] **Naming:** `accumulatedMore`, `cursorToFetch`, `lastNextCursor`, `handleLoadMore`, `resetPagination` are clear.
- [x] **No dead code:** All added code is used.
- [x] **Docs:** JSDoc on `useMarkReadWhenVisible`, `NotificationRowWrapper`, and exported `NotificationBell`; redirect page has a short comment.

### Security & safety

- [x] **No injection:** Notification `title`/`body` come from Convex; no raw user input rendered as HTML.
- [x] **No secrets:** No tokens or keys in client code.
- [x] **Auth/scope:** List and mutations use `accountId` and Convex auth; backend enforces membership.

### Additional notes

- **Performance:** Two `useQuery` calls (first page + optional “more” page) are acceptable. List is capped by `NOTIFICATION_LIST_LIMIT` (10) per page; accumulation is linear in number of “Load more” clicks.
- **Backend contract:** Cursor is the `_id` of the last item in the page (string). `cursorToFetch` and `lastNextCursor` as `string | undefined` match the API.
- **queueMicrotask:** Used so state updates after the effect run don’t trigger the “setState in effect” lint; behavior is correct and avoids synchronous setState in the effect body.
- **Redirect:** Server component with `await params` and `redirect()` is correct for Next.js App Router and keeps old `/notifications` URLs valid.

---

## 3. Actionable suggestions

1. **Error feedback (recommended):** In `handleMarkAllAsRead`, `handleDismiss`, and (if you ever add retry) load-more, add `.catch(() => toast.error("…"))` and optionally success toasts so users see when something fails or succeeds.
2. **Optional:** Add a small integration test or manual QA step for “Load more” (click, see next page, no duplicates, button disappears when no `nextCursor`).
3. **Optional:** If the Convex `list` API ever returns `nextCursor` as a different type, align `cursorToFetch` / `lastNextCursor` types (e.g. `Id<"notifications">`) for consistency.

---

## 4. Verdict

**Approve with minor recommendations.** The change is consistent with the plan, keeps the UX clear (popover, load more, redirect), and matches project patterns. The only notable gap is missing error (and optionally success) feedback on mutations; adding toast for failures is recommended before or soon after merge.
