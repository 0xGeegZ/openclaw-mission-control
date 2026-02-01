# PR Review Comments

## Goal

Generate **copy/paste-ready pull request review comments** for the current branch, with clear severity and precise code
anchors so the comments can be posted directly on GitHub.

## Inputs

- Prefer the **current git branch** diff against `origin/main` unless the user provides a PR base branch.
- If the user provides **manual testing notes / logs**, incorporate them as additional comments and map them to likely
  code locations.

## What to do

1. **Collect context**
   - Determine current branch name and whether the working tree is clean.
   - Identify base branch (default to `origin/main`) and list changed files (`git diff --name-status`).
   - Skim the highest-impact files (routes, server actions, validation, shared components).
2. **Find reviewable risks**
   - Security/authZ/authN gaps (server-side enforcement vs UI-only gating).
   - Data mapping correctness (form → API, API → UI, empty/null semantics).
   - Error handling and user-facing messaging (including i18n).
   - Type safety pitfalls (`any`, mismatched return shapes).
   - UX issues noted in testing (multi-select, multi-value inputs, loading states, navigation).
   - Performance/regression risks (unnecessary re-renders, sequential server calls).
3. **Produce PR review comments**
   - Output **multiple separate comments** (not one blob), each scoped to one issue.
   - For each comment, include **exact anchor(s)** so the reviewer can place it accurately in the diff.

## Output format (strict)

Return a list of comments using this format exactly:

- **[Blocking|Non-blocking] <Short title>**
  - **Where**: `<path>` → `<function/component/section>`
  - **Comment to paste**:
    > <The exact PR comment text as you'd write it on GitHub.>
  - **Why**: <One sentence, user impact or maintenance risk.>
  - **Suggested fix**: <One sentence, specific action.>

## Constraints

- Write in **English**.
- Prefer the repository’s conventions and existing utilities.
- Do **not** propose large refactors unless necessary; prioritize high-signal, actionable comments.
- If something is unclear, ask targeted clarifying questions instead of guessing.
