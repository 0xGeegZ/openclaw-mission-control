---
name: create-pr
description: PR Creation Command
disable-model-invocation: true
---

---

description: |
Complete PR creation workflow: analyze changes, stage/commit if needed,
create branch (if not already), generate PR title & description, and
submit PR using GitHub CLI. Handles the full end-to-end process.
globs:

- "\*_/_"
  alwaysApply: false

---

# PR Creation Command

When invoked, execute the following workflow:

## 1. Analyze Current State

**Check git status:**

```bash
git status
git diff --stat
git log --oneline dev..HEAD
```

**Determine action needed:**

- If uncommitted changes exist → stage and commit them
- If on dev → create feature branch
- If commits exist on branch → check if PR already exists

## 2. Handle Uncommitted Changes (if present)

**Stage relevant files:**

```bash
git add <files>
```

**Generate commit message:**

- Format: `type(scope): description`
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`
- Keep under 72 characters
- Example: `feat(rules): preserve context on rule blocking`

**Commit:**

```bash
git commit -m "type(scope): description"
```

## 3. Ensure Feature Branch (if needed)

**If currently on dev, create branch:**

- Format: `<type>/<short-description>`
- Example: `feat/context-on-failure`, `fix/rule-evaluation`
- Keep concise, use kebab-case

```bash
git checkout -b <branch-name>
```

## 4. Analyze Changes for PR

**Review diff scope:**

```bash
git diff dev --stat
git diff dev --name-status
```

**Group changes by purpose:**

- Core changes (main feature/fix)
- Tests (new/updated test coverage)
- Documentation (README, comments)
- Dependencies (package.json updates)
- Configuration (build, lint, env)

## 5. Generate PR Content

**Title (< 72 chars):**

- Format: `Type: Brief description of main change`
- Example: `Feat: Preserve context when rules block evaluation`
- Capitalize first word, no period at end

**Description structure:**

```markdown
## Summary

[One paragraph explaining what this PR does and why]

## Changes

**🔧 Core Changes**
_[Brief description of main implementation]_

- `file1.ts`: description
- `file2.ts`: description

**✅ Tests**
_[Brief description of test coverage]_

- `test1.spec.ts`: description
- `test2.spec.ts`: description

**📚 Documentation** (if applicable)
_[Brief description of doc updates]_

- `README.md`: description

## Related

Closes #[issue-number] (if applicable)
Ref #[issue-number] (if related but not closing)

## Testing

1. Run `npm test` and verify all tests pass
2. [Specific test scenario 1]
3. [Specific test scenario 2]
```

**Guidelines:**

- Keep descriptions concise and actionable
- No code snippets in PR description
- Defer detailed rationale to linked issues
- Focus on WHAT changed, not WHY (unless critical)

## 6. Create PR with GitHub CLI

**Check if PR exists:**

```bash
gh pr list --head $(git branch --show-current)
```

**Create PR if it doesn't exist:**

```bash
gh pr create \
  --title "<PR Title>" \
  --body "<PR Description>" \
  --base dev
```

**Options to consider:**

- `--draft` - Create as draft PR
- `--assignee @me` - Auto-assign to self
- `--reviewer <username>` - Request review

## 7. Confirm and Output

**Display:**

- ✅ Branch: `<branch-name>`
- ✅ Commits: `<commit-count>` commit(s)
- ✅ PR created: `<PR-URL>`
- 📝 Title: `<PR-title>`

**Next steps for user:**

- Review PR at the provided URL
- Wait for CI checks to complete
- Address review feedback if needed

---

## Example Usage

**User says:** "Create a PR for my changes"

**Command executes:**

1. Checks git status → finds uncommitted changes
2. Stages files → commits with `feat(rules): preserve context on blocking`
3. Already on feature branch → continues
4. Analyzes diff → groups changes
5. Generates PR title and description
6. Creates PR via `gh pr create`
7. Outputs PR URL and summary
