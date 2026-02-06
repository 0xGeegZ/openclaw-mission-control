---
name: release-management
description: Release checklists, changelogs, and versioning. Align with the squad lead and any existing release process.
---

# Release management

Use this skill for release checklists, changelogs, and versioning. Align with the squad lead and any existing release process.

## When to use

- Preparing or executing a release (app, package, or runtime).
- Writing or updating changelogs and release notes.
- Deciding version bumps (semver: major/minor/patch) and release cadence.
- Coordinating with the squad lead on timing, scope, and rollback.

## Release checklist (outline)

1. **Pre-release**
   - Confirm all release-blocking work is done (tests, docs, migrations if any).
   - Update version in the right place(s) (e.g. `package.json`, app config).
   - Draft or update changelog/release notes for the version.
   - Get squad lead sign-off if required.

2. **Cut release**
   - Tag or cut the release (e.g. Git tag, GitHub release, package publish).
   - Document the exact artifact or commit for the release.

3. **Post-release**
   - Announce or notify as per process.
   - Update any “latest” or “current” references.
   - Note any follow-ups (patches, docs, rollback steps).

## Changelog and versioning

- Prefer a single source of truth (e.g. `CHANGELOG.md` or GitHub Releases) with a consistent format (e.g. “Added / Changed / Fixed” or keep-a-changelog).
- Use semantic versioning (semver) unless the project specifies otherwise: major for breaking changes, minor for new features, patch for fixes.
- Tie each changelog entry to a version and date; link to commits or PRs where helpful.

## Collaboration

- Align with the squad lead on what counts as release-blocking and who approves releases.
- Reuse existing templates or runbooks if the project has them; otherwise propose a minimal checklist and iterate.
