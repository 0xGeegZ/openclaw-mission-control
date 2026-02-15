# Releases and changelog

This project uses [Changesets](https://github.com/changesets/changesets) for versioning and changelog generation in the monorepo.

## Versioned workspace members

All of the following are versioned; changes to any of them require a changeset.

- **Apps:** `web-app`, `runtime-service`, `@apps/blog`, `native`
- **Packages:** `@packages/backend`, `@packages/shared`, `@packages/ui`, `@packages/env`

When you add a new workspace app or package, add it to this list so contributors know to add changesets for it.

## Adding a changeset

When your PR changes any of the versioned apps or packages listed above:

1. From the repo root, run:

   ```bash
   npx changeset
   ```

2. Follow the prompts: choose the affected app(s) or package(s) to bump (major/minor/patch) and write a short changelog summary.
3. Commit the new file under `.changeset/` (e.g. `.changeset/my-feat.md`) with your PR.

Merging to the release branch (`master`) runs the **Release** GitHub Action, which will open or update a "Version Packages" PR. That PR bumps versions and updates each package's `CHANGELOG.md`. Merging that PR completes the release; if you publish to npm, the action can also run `npm run release` (publish).

## GitHub and npm secrets

- **GITHUB_TOKEN**: Provided by GitHub Actions; no setup needed. Used to create/update the version PR and push commits.
- **NPM_TOKEN**: Required only if you publish packages to npm. Add it as a repository secret. If you don't publish, the workflow can still create version PRs and update changelogs; the publish step may be skipped or fail until `NPM_TOKEN` is set.

## Local version bump (optional)

To update versions and changelogs locally without publishing:

```bash
npm run version
```

This consumes existing changesets, bumps versions, and updates `CHANGELOG.md` files. Do not run this if you prefer the Release workflow to do it via the version PR.
