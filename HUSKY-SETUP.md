# Husky Pre-Commit Hook Setup

**Task ID:** k97dz08a2mxvwfpcheyz8sasc980p88d

---

## Quick Start

```bash
# Install husky and lint-staged
npm install --save-dev husky lint-staged

# Initialize husky
npx husky install

# Create pre-commit hook
npx husky add .husky/pre-commit "npx lint-staged"

# Create commit-msg hook (optional)
npx husky add .husky/commit-msg 'npx --no -- commitlint --edit "$1"'

# Verify hooks are set up
ls -la .husky/
```

---

## What Runs on Commit

When you run `git commit`, husky triggers pre-commit validation via `lint-staged`:

### Pre-Commit Hook: `.husky/pre-commit`

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx lint-staged
```

### Lint-Staged Configuration: `.lintstagedrc.json` (add to root)

```json
{
  "*.{ts,tsx}": [
    "eslint --fix",
    "prettier --write"
  ],
  "*.json": [
    "prettier --write"
  ]
}
```

---

## Validation Flow

On `git commit`:

1. **Lint-Staged** runs only on staged files
2. **ESLint** checks for type safety violations
3. **Prettier** auto-formats code
4. **If all pass** → Commit allowed
5. **If any fail** → Commit blocked, fix and retry

---

## Installation Verification

After setup, verify hooks exist:

```bash
# Should show pre-commit hook
cat .husky/pre-commit

# Should output:
# #!/bin/sh
# . "$(dirname "$0")/_/husky.sh"
# 
# npx lint-staged
```

---

## Troubleshooting

### Hook Not Running

```bash
# Re-initialize husky
npx husky install

# Verify git hooks are executable
chmod +x .husky/pre-commit
chmod +x .husky/commit-msg
```

### Commit Still Goes Through

```bash
# Manually run lint-staged to test
npx lint-staged

# If it fails, check which files are staged
git diff --cached --name-only
```

### Skip Hook (Emergency Only)

```bash
# Use with caution—skips type checks
git commit --no-verify

# Better: Fix the issue and retry
npm run lint -- --fix
npm run typecheck
git add .
git commit
```

---

## Adding More Hooks

```bash
# Type check before commit (optional, in addition to lint-staged)
npx husky add .husky/pre-commit "npm run typecheck"

# Run tests on specific files (optional)
npx husky add .husky/pre-commit "npm run test:affected"
```

---

## Integration with Package.json

Add prepare script to auto-install hooks when cloning:

```json
{
  "scripts": {
    "prepare": "husky install"
  }
}
```

Now when team members run `npm install`, husky hooks are automatically installed.

---

## Uninstalling Husky

If needed:

```bash
npm uninstall husky
rm -rf .husky
```

---

## Documentation

- **Husky Docs**: https://typicode.github.io/husky/
- **Lint-Staged**: https://github.com/okonet/lint-staged
