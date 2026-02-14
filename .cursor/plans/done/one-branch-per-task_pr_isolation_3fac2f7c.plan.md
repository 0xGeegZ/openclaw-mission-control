---
name: One-branch-per-task PR isolation
overview: Enforce one Git branch per task so each PR contains only that task's commits. All agents share one repo clone; the fix is to require task-scoped branch names and explicit checkout-from-dev before code edits, and to update the create-pr skill and notification prompt accordingly.
todos: []
isProject: false
---

# One-branch-per-task: fix PR commit mixing

## 1. Context and goal

**Problem:** PRs linked to a task (e.g. PR #102 for task k972...) contain 12 commits instead of the 3 for that task because multiple tasks' work lands on the same branch. Root cause: one shared repo clone at `/root/clawd/repos/openclaw-mission-control` for all agents, and no rule tying a branch to a task.

**Goal:** Ensure each task uses a single dedicated branch so that when an agent creates a PR, the PR contains only that task's commits. No change to repo layout (still one clone); enforce branch discipline via prompts, docs, and the create-pr skill.

**Constraints:** Backward compatible (existing PRs and branches unchanged). No new env vars. Convex task IDs are ~32 chars (e.g. `k972tbe4p5b4pywsdw4sze8gm9812kvz`); branch name `feat/task-<taskId>` is valid (GitHub branch max 255 chars).

---

## 2. Codebase research summary

- **[apps/runtime/src/delivery.ts](apps/runtime/src/delivery.ts)** – Builds the notification prompt. `formatNotificationMessage()` receives `context.task` (with `_id`); `repositoryDetails` / `localRepoHint` carry repo and git instructions. Task is rendered as `Task ID: ${task._id}`. No branch naming today.
- **[docs/runtime/AGENTS.md](docs/runtime/AGENTS.md)** – Source of truth for agent behavior; "Primary repository" and "Creating a PR" describe one clone and generic branch/PR flow. Synced into workspace by [apps/runtime/openclaw/start-openclaw.sh](apps/runtime/openclaw/start-openclaw.sh) and optionally via `OPENCLAW_AGENTS_MD_PATH`; [apps/runtime/src/openclaw-profiles.ts](apps/runtime/src/openclaw-profiles.ts) uses file or `DEFAULT_AGENTS_MD`.
- **[packages/backend/convex/seed.ts](packages/backend/convex/seed.ts)** – `DOC_AGENTS_CONTENT` duplicates AGENTS.md content for the Convex "AGENTS.md" reference document; must stay in sync with repo AGENTS.md for the "Creating a PR" and git workflow parts.
- **[.cursor/skills/create-pr/SKILL.md](.cursor/skills/create-pr/SKILL.md)** and **[packages/backend/convex/seed-skills/create-pr.md](packages/backend/convex/seed-skills/create-pr.md)** – create-pr skill: "If on dev, create branch" with format `<type>/<short-description>`. No task ID. Convex seed skills are used by runtime (contentMarkdown → workspace `skills/<slug>/SKILL.md`); Cursor skill is for IDE; both should be updated in sync.
- **[packages/backend/convex/service/actions.ts](packages/backend/convex/service/actions.ts)** – `linkTaskToPrForAgentTool` fetches PR via GitHub API and updates body with task marker; PR response includes `head.ref` (branch name). Optional: validate branch name contains task ID.
- **[apps/runtime/src/delivery.test.ts](apps/runtime/src/delivery.test.ts)** – `formatNotificationMessage` tests use `buildContext()` with `task: { _id: "task1", ... }`. Add test that message includes branch rule with task ID when task present.

---

## 3. High-level design

```mermaid
sequenceDiagram
  participant Agent
  participant Notification as NotificationPrompt
  participant Repo as SharedRepo

  Note over Agent,Repo: Current (broken): any branch name, same clone
  Agent->>Repo: checkout feat/foo (generic)
  Agent->>Repo: commits for task A
  Agent->>Repo: later: same branch, commits for task B
  Note over Agent,Repo: PR has mixed commits

  Note over Agent,Repo: After fix: branch = feat/task-<taskId>
  Notification->>Agent: "Use branch feat/task-<taskId> only"
  Agent->>Repo: git checkout dev; git pull; git checkout -b feat/task-<id>
  Agent->>Repo: commits only for this task
  Agent->>Repo: push feat/task-<id>; gh pr create
  Note over Agent,Repo: PR has only this task's commits
```



**Data flow:**

1. **Notification delivery** – When building the prompt for a task notification, the runtime already has `task._id`. Inject a single, explicit "branch rule" sentence into the repository/git section: use branch `feat/task-<taskId>` only; create from `dev` (or checkout if exists) before any code edit.
2. **AGENTS.md and seed** – Add a short "One branch per task" subsection that states the same rule so agents see it in their workspace doc and in the Convex reference.
3. **create-pr skill** – Change "Ensure Feature Branch" to: when working on a task, use `feat/task-<taskId>` (task ID from the notification); create from `dev` or checkout existing. Keep non-task usage (e.g. "if no task context, use conventional branch name") so the skill still works when no task is present.
4. **Optional safeguard** – In `linkTaskToPrForAgentTool`, after fetching the PR, check that `head.ref` contains the task ID; if not, log a warning (and optionally return a soft error so the orchestrator re-links after correcting the branch).

---

## 4. File and module changes


| Location                                                                                             | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [docs/runtime/AGENTS.md](docs/runtime/AGENTS.md)                                                     | Add subsection **"One branch per task"** under "Primary repository" or "Creating a PR": branch name must be `feat/task-<taskId>` (task ID from the notification). Before any code edit: `git fetch origin && git checkout dev && git pull`, then `git checkout -b feat/task-<taskId>` or `git checkout feat/task-<taskId>` if it already exists. All commits and the PR for this task must be on that branch only.                                                                                                                                          |
| [packages/backend/convex/seed.ts](packages/backend/convex/seed.ts)                                   | In `DOC_AGENTS_CONTENT`, add the same "One branch per task" wording (escaped for template literal) so the Convex doc matches AGENTS.md.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| [apps/runtime/src/delivery.ts](apps/runtime/src/delivery.ts)                                         | In `formatNotificationMessage`, when `task` is set, append to the repository/git instruction block (e.g. after `localRepoHint` or inside `repositoryDetails`) one short line: e.g. "For this task use only branch `feat/task-&lt;taskId&gt;` (Task ID above). Before code edits: git fetch origin, git checkout dev, git pull, then git checkout -b feat/task-&lt;taskId&gt; or git checkout feat/task-&lt;taskId&gt; if it exists. Push and open PR from that branch only." Use `task._id` for the placeholder so the agent sees the concrete branch name. |
| [apps/runtime/src/openclaw-profiles.ts](apps/runtime/src/openclaw-profiles.ts)                       | In `DEFAULT_AGENTS_MD`, add one sentence in the "Writable clone" / repo bullet or a new bullet: "One branch per task: use branch feat/task-&lt;taskId&gt; (from your notification); create it from dev before editing, and push/PR only from that branch." So embedded default stays consistent when no file path is used.                                                                                                                                                                                                                                  |
| [.cursor/skills/create-pr/SKILL.md](.cursor/skills/create-pr/SKILL.md)                               | In "3. Ensure Feature Branch": add rule "When working on a task, use branch name `feat/task-<taskId>` (task ID from your notification). Create from dev: `git checkout dev && git pull && git checkout -b feat/task-<taskId>`. If branch already exists: `git fetch origin && git checkout feat/task-<taskId>`. Do not use a generic branch name for task work." Keep existing generic branch format as fallback when not in task context.                                                                                                                  |
| [packages/backend/convex/seed-skills/create-pr.md](packages/backend/convex/seed-skills/create-pr.md) | Same create-pr changes as above so Convex-seeded skill content matches.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| [packages/backend/convex/service/actions.ts](packages/backend/convex/service/actions.ts)             | Optional: In `linkTaskToPrForAgentTool`, after fetching PR (response has `head.ref`), if `head.ref` does not include `args.taskId`, log warning ("PR branch does not match task; consider using branch feat/task-&lt;taskId&gt;"). Do not fail the link; task metadata and PR body update still succeed.                                                                                                                                                                                                                                                    |
| [apps/runtime/src/delivery.test.ts](apps/runtime/src/delivery.test.ts)                               | Add test: with `buildContext({ task: { _id: "k97abc", ... } })`, assert `formatNotificationMessage(...)` includes the string `feat/task-k97abc` (or equivalent) and "only" / "branch" so the branch rule is present when task is set. Add test: when `task` is null, message does not contain "feat/task-" (no task-specific branch rule).                                                                                                                                                                                                                  |


---

## 5. Step-by-step tasks

1. **AGENTS.md** – In [docs/runtime/AGENTS.md](docs/runtime/AGENTS.md), after "Creating a PR" (or under "Primary repository"), add subsection "One branch per task" with: branch name `feat/task-<taskId>` (task ID from notification); before any code edit run `git fetch origin`, `git checkout dev`, `git pull`, then `git checkout -b feat/task-<taskId>` or `git checkout feat/task-<taskId>` if it exists; all commits and PR for this task only on that branch.
2. **Seed DOC_AGENTS_CONTENT** – In [packages/backend/convex/seed.ts](packages/backend/convex/seed.ts), add the same "One branch per task" text to `DOC_AGENTS_CONTENT` (escape backticks and `\` for template).
3. **delivery.ts prompt** – In [apps/runtime/src/delivery.ts](apps/runtime/src/delivery.ts), in `formatNotificationMessage`, when `task` is defined, add a branch rule line that includes the literal branch name `feat/task-${task._id}` and the exact git steps (fetch, checkout dev, pull, checkout branch). Insert into the block that builds `repositoryDetails` / `localRepoHint` (e.g. append to the array or to `localRepoHint` when task exists).
4. **DEFAULT_AGENTS_MD** – In [apps/runtime/src/openclaw-profiles.ts](apps/runtime/src/openclaw-profiles.ts), add one sentence to `DEFAULT_AGENTS_MD` about one branch per task (`feat/task-<taskId>`).
5. **create-pr skill (Cursor)** – Edit [.cursor/skills/create-pr/SKILL.md](.cursor/skills/create-pr/SKILL.md) section "3. Ensure Feature Branch": require `feat/task-<taskId>` when in task context; document creating from dev or checking out existing branch; keep generic format as fallback.
6. **create-pr skill (Convex seed)** – Mirror the create-pr changes in [packages/backend/convex/seed-skills/create-pr.md](packages/backend/convex/seed-skills/create-pr.md). Run seed-skills generation if the project uses a step that copies seed-skills into generated content.
7. **Optional: linkTaskToPrForAgentTool** – In [packages/backend/convex/service/actions.ts](packages/backend/convex/service/actions.ts), after parsing PR response, read `head.ref`; if it does not include the task ID, log a warning. Do not throw; still update task metadata and PR body.
8. **Tests** – In [apps/runtime/src/delivery.test.ts](apps/runtime/src/delivery.test.ts): (a) test that with task present, formatted message contains the task-specific branch name (e.g. `feat/task-task1` for `_id: "task1"`); (b) test that without task, message does not contain the task-branch pattern (or the branch rule is omitted). Run `npm run test` in apps/runtime and fix any regressions.

---

## 6. Edge cases and risks

- **Existing branches** – Agents may have already created branches without the task ID. New rule applies from now on; existing PRs stay linked. No migration.
- **Long branch names** – Convex IDs are 32 chars; `feat/task-<id>` is under 255. No truncation needed.
- **Task ID in notification** – Task is always present when we show the branch rule (we only inject when `task` is set). If in future a notification has no task, we do not show the rule (already handled by conditional).
- **create-pr without task** – Skill text will say "when working on a task" use task branch; otherwise use conventional name. So ad-hoc PRs (e.g. from heartbeat) still work.
- **linkTaskToPrForAgentTool** – If we add validation, use warning-only so mislinked PRs can still be fixed manually and the tool does not break existing flows.

---

## 7. Testing strategy

- **Unit:** `formatNotificationMessage` in [apps/runtime/src/delivery.test.ts](apps/runtime/src/delivery.test.ts): message includes `feat/task-<taskId>` when task present; no task-branch rule when task null.
- **Lint/typecheck:** `yarn typecheck` and `yarn lint` at repo root after changes.
- **Manual QA:** (1) Start runtime + OpenClaw; assign a task to an agent; confirm notification prompt contains the branch rule with that task’s ID. (2) Run create-pr skill in a task context and confirm it uses feat/task-. (3) Optionally link a PR with wrong branch and confirm warning is logged (if implemented).

---

## 8. Rollout

- No feature flags. Deploy runtime and backend as usual. Re-seed Convex if DOC_AGENTS_CONTENT or seed-skills change so agents get updated skill text and doc.
- After deploy, existing PRs and branches are unchanged; new task work should use the new branch naming. Optionally remind orchestrator to use task_link_pr only for PRs whose branch matches the task.

---

## 9. TODO checklist

- Add "One branch per task" subsection to [docs/runtime/AGENTS.md](docs/runtime/AGENTS.md)
- Add same wording to `DOC_AGENTS_CONTENT` in [packages/backend/convex/seed.ts](packages/backend/convex/seed.ts)
- In [apps/runtime/src/delivery.ts](apps/runtime/src/delivery.ts), inject branch rule (with `feat/task-${task._id}` and git steps) when `task` is set
- Add one-branch-per-task sentence to `DEFAULT_AGENTS_MD` in [apps/runtime/src/openclaw-profiles.ts](apps/runtime/src/openclaw-profiles.ts)
- Update "Ensure Feature Branch" in [.cursor/skills/create-pr/SKILL.md](.cursor/skills/create-pr/SKILL.md) for task-scoped branch name
- Update [packages/backend/convex/seed-skills/create-pr.md](packages/backend/convex/seed-skills/create-pr.md) to match create-pr skill
- Optional: In [packages/backend/convex/service/actions.ts](packages/backend/convex/service/actions.ts) `linkTaskToPrForAgentTool`, add branch-name warning when `head.ref` does not contain task ID
- Add delivery.test.ts tests: branch rule present when task set; absent when task null
- Run `yarn typecheck` and `yarn lint`; run `npm run test` in apps/runtime

