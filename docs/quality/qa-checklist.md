# Manual QA Checklist

Use this checklist for new pages and runtime controls before release.

## Authentication & access

- [ ] Sign in with Clerk works; redirect to dashboard
- [ ] Sign out works; redirect to splash/home
- [ ] Account switcher lists only accounts user is a member of
- [ ] Unauthorized access to admin routes (e.g. OpenClaw, Members) is blocked for non-admin

## Dashboard & navigation

- [ ] Sidebar links: Tasks, Agents, Documents, Activity, Search, Analytics open correct pages
- [ ] Profile link in sidebar opens profile page (user + workspaces)
- [ ] Settings opens; General / Members / Notifications tabs work
- [ ] Appearance (theme) change persists and syncs on next load
- [ ] Mobile nav shows and works on small viewports

## Tasks

- [ ] Kanban board loads; columns show correct statuses
- [ ] Create task opens dialog; submit creates task in Inbox
- [ ] Drag-and-drop moves task between columns and updates status
- [ ] Task card shows priority dot and status border (visual cue)
- [ ] Click task opens task detail; thread and messages load
- [ ] Add comment in thread; message appears; mentions create notifications
- [ ] Header stats (tasks, agents, activity 24h) and live clock display

## Agents

- [ ] Agents roster loads; agent cards show name, role, status badge
- [ ] Create agent opens dialog; submit creates agent
- [ ] Click agent card navigates to agent detail page
- [ ] Agent detail shows config, recent activity, activity feed

## Documents

- [ ] Docs page loads (grid/list)
- [ ] Create document (file/folder) works
- [ ] Open document; edit title/content; Save persists
- [ ] Duplicate document creates copy
- [ ] Link to task opens dialog; select task links document

## Activity feed

- [ ] Feed loads; activities listed
- [ ] Filter by type (dropdown) filters list correctly
- [ ] Activity items show actor, description, timestamp
- [ ] All activity types render (task_created, message_created, member_added, etc.)

## Notifications (bell popover)

- [ ] Bell in sidebar shows unread count badge; count updates in real time
- [ ] Click bell opens popover with recent notifications (All / Unread filter)
- [ ] Popover: loading skeletons show while fetching; empty state shows "All caught up!" when no notifications
- [ ] Dismiss (per item) removes notification from list and updates badge
- [ ] All view shows "Dismiss all" in header; clears notifications
- [ ] Unread view shows "Mark all read" in header; clears unread styling and badge
- [ ] Load more appears at list footer; fetches next page or shows "No more notifications"
- [ ] Click notification with task links to task detail; popover closes
- [ ] Visiting `/[accountSlug]/notifications` redirects to tasks (no dead page)

## Search

- [ ] Search page; entering 2+ characters runs search
- [ ] Results show tasks, documents, agents in sections
- [ ] Click result navigates to correct page

## Analytics

- [ ] Analytics page loads; summary cards (tasks, agents, activity 24h)
- [ ] Tasks by status and agents by status sections show counts

## OpenClaw admin (admin only)

- [ ] Runtime status card shows current status (online/degraded/offline)
- [ ] Version info (OpenClaw, runtime service) displays
- [ ] Agent defaults: change model/temperature/max tokens; Save Defaults persists
- [ ] Behavior flags toggles persist
- [ ] Rate limits (RPM, TPD) persist
- [ ] Restart button requests restart; toast confirms; runtime exits when it polls (if running)

## Profile

- [ ] Profile shows signed-in user name/email and avatar
- [ ] Workspaces list shows accounts user belongs to
- [ ] Click workspace switches to that account

## Runtime (if running)

- [ ] Health endpoint returns 200 with status, uptime, gateway/delivery/heartbeat, memory
- [ ] After admin clicks Restart, runtime process exits (process manager restarts it)
