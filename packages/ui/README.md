# @packages/ui

Shared UI components (shadcn/ui style) for the mission-control monorepo.

## Updating shadcn components

Run the CLI **from this package** with an explicit path so files go to `src/components`:

```bash
cd packages/ui
npx shadcn@latest add avatar badge button card dialog dropdown-menu input label scroll-area select separator sheet skeleton tabs textarea tooltip --overwrite --yes --path src/components
```

To update a single component:

```bash
npx shadcn@latest add button --overwrite --yes --path src/components
```

Do not run the CLI from `apps/web` without `--path`; it may create files under `@packages/ui/components/` instead of `src/components/`.
