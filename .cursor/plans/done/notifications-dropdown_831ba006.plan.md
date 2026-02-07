---
name: notifications-dropdown
overview: Move notifications from dedicated page to an in-place popover panel on the current page, keeping full actions and realtime updates.
todos:
  - id: refactor-bell
    content: Refactor NotificationBell to Popover panel w/ actions
    status: completed
  - id: update-route
    content: Replace notifications page with redirect/message
    status: completed
  - id: qa-tests
    content: Add tests or document manual QA checklist
    status: completed
isProject: false
---

# Notifications Popover Plan

#### 1. Context & goal

Move notifications off the dedicated page and into an in-page popover panel anchored to the bell icon in the sidebar. The popover should show a medium-sized list with full actions (mark read, dismiss, mark all read), preserve real-time updates via Convex, and avoid breaking UX (no dedicated page). Constraints: Next.js App Router, Convex realtime queries, shadcn/ui components, multi-tenant account scoping, and a11y-friendly controls.

#### 2. Codebase research summary

Files inspected:

- [apps/web/src/components/dashboard/NotificationBell.tsx](/Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/components/dashboard/NotificationBell.tsx)
- [apps/web/src/components/dashboard/Sidebar.tsx](/Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/components/dashboard/Sidebar.tsx)
- [apps/web/src/app/(dashboard)/[accountSlug]/notifications/page.tsx](</Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/app/(dashboard)/[accountSlug]/notifications/page.tsx>)
- [apps/web/src/components/dashboard/AccountSwitcher.tsx](/Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/components/dashboard/AccountSwitcher.tsx)
- [docs/concept/openclaw-mission-control-initial-article.md](/Users/guillaumedieudonne/Desktop/mission-control/docs/concept/openclaw-mission-control-initial-article.md)
- [docs/concept/openclaw-mission-control-cursor-core-instructions.md](/Users/guillaumedieudonne/Desktop/mission-control/docs/concept/openclaw-mission-control-cursor-core-instructions.md)
- [docs/build/00-orchestrator.md](/Users/guillaumedieudonne/Desktop/mission-control/docs/build/00-orchestrator.md)

What we learned:

- `NotificationBell` currently links to `/[accountSlug]/notifications` and already queries `api.notifications.getUnreadCount`.
- The notifications page renders the list, icons/colors, and actions (mark read, dismiss, mark all read) and uses `api.notifications.list`, `markAsRead`, `markAllAsRead`, and `remove`.
- `AccountSwitcher` shows a local pattern for shadcn dropdown usage and styling; we can mirror similar structure but use a Popover for richer content.
- The sidebar is the host for the bell icon, so changes can be localized there.

#### 3. High-level design

Frontend-only change: replace the bell link with a Popover-triggered panel that shows a list of recent notifications.

- Data flow: Bell component → `useQuery(api.notifications.list)` → render list → `useMutation` for actions → Convex updates → realtime UI refresh.
- Use `Popover` from `@packages/ui/components/popover` for a panel-like surface (better for complex layout than menu semantics).
- Reuse notification icon/color maps and item rendering logic from the existing page for consistency.
- Limit list to a medium number (e.g., `limit: 10`) and add scroll container for overflow.
- Remove or repurpose the notifications page route to avoid a dead-end page; since dropdown-only was requested, we will remove its UI content and optionally redirect to a safer location (e.g., tasks) if the route remains.

#### 4. File & module changes

Existing files to touch:

- [apps/web/src/components/dashboard/NotificationBell.tsx](/Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/components/dashboard/NotificationBell.tsx)
  - Replace `Link` wrapping the bell with `Popover` trigger and content.
  - Add list query (`api.notifications.list`) with `limit` and optional `filter` state (all/unread).
  - Add mutations for `markAsRead`, `markAllAsRead`, `remove`.
  - Add notification item rendering (reuse icon/color maps; keep `formatDistanceToNow` timestamps).
  - Add loading/empty states inside the popover.
- [apps/web/src/app/(dashboard)/[accountSlug]/notifications/page.tsx](</Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/app/(dashboard)/[accountSlug]/notifications/page.tsx>)
  - Replace with a lightweight redirect or message since the page is no longer used (dropdown-only requirement). Prefer redirect to `/${accountSlug}/tasks`.
- [apps/web/src/components/dashboard/Sidebar.tsx](/Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/components/dashboard/Sidebar.tsx)
  - No structural changes expected beyond any props needed for the new bell (likely none).

New files to create:

- None (reuse existing components and logic; refactor within `NotificationBell`).

#### 5. Step-by-step tasks

1. Refactor `NotificationBell` into a Popover-based panel, moving list rendering and actions from the notifications page into the popover. Keep imports at top and add JSDoc to any new exported helpers if introduced.
2. Add loading and empty states inside the popover, mirroring the skeletons/empty card language from the existing page, but compacted for the panel size.
3. Update the notifications page route to redirect (server-side) to `/${accountSlug}/tasks` or to render a minimal message with a link, ensuring no dead-end.
4. Verify bell badge counts still reflect unread via `getUnreadCount` and that actions update the count in realtime.
5. Update or add tests (if tests exist for notifications UI) to cover popover actions and empty state; otherwise note manual QA steps.

#### 6. Edge cases & risks

- Unread count and list queries can be `undefined` during auth boot; keep the `skip` pattern to avoid errors.
- Large notification lists should not render fully; enforce limit and scroll container.
- Popover actions must be keyboard accessible and not close unexpectedly when clicking action buttons.
- If a notification has no `taskId`, avoid linking to task detail (render text-only item).
- Route removal could break bookmarks; redirect mitigates this.

#### 7. Testing strategy

Unit tests:

- If a component test setup exists, test the rendering of unread count, empty state, and action button callbacks.

Integration/E2E:

- Open dashboard, click bell, verify list renders and action buttons update state in realtime.

Manual QA checklist:

- Bell shows unread count badge with live updates.
- Popover opens/closes reliably and is keyboard navigable.
- Mark as read removes unread styling and decreases badge.
- Dismiss removes item and badge updates.
- Mark all read clears unread styling and badge.
- No notifications shows compact empty state.
- Visiting `/[accountSlug]/notifications` redirects appropriately.

#### 8. Rollout / migration (if relevant)

- No data migration required.
- Optional feature flag not necessary; change is UI-only. Redirect handles old route.
- Add a small log/analytics event if a tracking system exists (not found in current scan).

#### 9. TODO checklist

- Frontend: Refactor `NotificationBell` to a Popover panel with list + actions.
- Frontend: Add compact loading/empty states inside the popover.
- Frontend: Redirect or replace notifications page content.
- Tests: Add/update UI tests if a testing harness exists; otherwise document manual QA.
- QA: Run manual checks for popover actions and unread badge updates.
