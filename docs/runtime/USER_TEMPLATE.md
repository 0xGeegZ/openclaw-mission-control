# USER.md template

Account-shared context for all agents. Editable in **Settings > Agent Profile** (admin only). The runtime materializes this as `USER.md` in each agent workspace.

## Purpose

- Describe your team, repo, and workflow so agents share the same context.
- Replace hardcoded repo paths and workflow details that used to live in static AGENTS/delivery prompts.

## Example

```markdown
# User

We use the **openclaw-mission-control** repo. Main clone at `/root/clawd/repos/openclaw-mission-control`; task worktrees at `/root/clawd/worktrees/feat-task-<taskId>`. Base branch: `dev`. All code work happens in the task worktree; PRs target `dev`.

Team: Squad Lead (orchestrator), Engineer, QA, Designer. QA reviews and marks done; Squad Lead can also close when no QA is assigned.
```

## Limits

- Max length enforced in backend (see `USER_MD_MAX_LENGTH` in validators). UI shows character count.
