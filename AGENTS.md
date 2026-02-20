## Learned User Preferences

- Prepend GIT_EDITOR=true to git commands to avoid getting blocked.
- Commit only when instructed; do not keep committing subsequent work unless explicitly told.
- Use commit message format: short title (< 80 chars), 2–3 bullet points (< 80 chars).
- Run create-pr from the feature worktree, not the main repo root.
- Add changeset files for versioned packages; use separate changeset files per PR/scope for clean history.
- When asked to handle migrations or cleanup end-to-end, run the migration, remove the migration script and legacy usage, then rerun seeds; stop when everything is good.
- Prefer full removal of legacy implementation when migrating (no \_legacy stripping or deprecated keys left behind).
- Answer in English; add JSDoc and only useful comments for engineers; do not write code until 95%+ confident.

## Learned Workspace Facts

- Default branch is master (not main) for this repo.
- Convex schema migrations: make field optional first, run batched mutation, then remove field and index, then code cleanup.
- Session keys use backend-resolved task/system keys; session close happens on archived (not done).
- Use a feature worktree for PR creation and implementation when multiple features may be in progress.
