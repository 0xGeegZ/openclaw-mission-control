# Contributing to OpenClaw Mission Control

Thank you for your interest in contributing to OpenClaw Mission Control! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## Getting Started

### Prerequisites

- Node.js 24+ (use nvm: `nvm use`)
- npm 10+
- Git

### Local Development Setup

1. **Fork and clone the repository**

   ```bash
   git clone https://github.com/YOUR_USERNAME/openclaw-mission-control.git
   cd openclaw-mission-control
   ```

2. **Install dependencies** (use nvm so Node 24 is active; otherwise `npm install` will fail)

   ```bash
   nvm use
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp apps/web/.env.example apps/web/.env.local
   # Edit apps/web/.env.local with your Clerk and Convex keys (validated via @packages/env at build)
   ```

4. **Start development servers**

   **Option A (one command from repo root):** Run `npm run dev` — starts both Convex backend and web app.

   **Option B (two terminals):**

   ```bash
   # Terminal 1: Convex backend
   cd packages/backend && npx convex dev

   # Terminal 2: Web app only (from repo root, use cd so you don't start Convex again)
   cd apps/web && npm run dev
   ```

5. **Verify setup**

   ```bash
   npm run typecheck
   npm run lint
   ```

To run the **runtime** (agent delivery, heartbeats, OpenClaw gateway) locally, see the main [README](README.md) section [Run the runtime locally (optional)](README.md#run-the-runtime-locally-optional) and [docs/runtime/runtime-docker-compose.md](docs/runtime/runtime-docker-compose.md).

## Development Workflow

### Branch Naming

Use descriptive branch names:

- `feat/feature-name` - New features
- `fix/bug-description` - Bug fixes
- `docs/what-changed` - Documentation updates
- `refactor/what-changed` - Code refactoring
- `test/what-tested` - Test additions

### Commit Messages

Follow conventional commits:

```text
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:

- `feat(tasks): add drag-and-drop reordering`
- `fix(agents): resolve heartbeat timeout issue`
- `docs(readme): update installation instructions`

### Pull Request Process

1. **Create a feature branch**

   ```bash
   git checkout -b feat/your-feature
   ```

2. **Make your changes**
   - Write clean, documented code
   - Follow existing code patterns
   - Add tests for new functionality

3. **Run checks locally**

   ```bash
   npm run typecheck
   npm run lint
   npm run build
   ```

4. **Push and create PR**

   ```bash
   git push origin feat/your-feature
   ```

   Then open a Pull Request on GitHub.

5. **PR Review**
   - Fill out the PR template
   - Address reviewer feedback
   - Ensure CI passes

## Code Style

### TypeScript

- Use strict mode
- Prefer `interface` over `type` for objects
- Export functions, not arrow functions for components
- Use descriptive variable names with auxiliary verbs (`isLoading`, `hasError`)

### React/Next.js

- Use functional components
- Server components are default (no directive needed)
- Client components must have `"use client"` directive
- Colocate components with their routes when possible

### Convex

- Validate all inputs with `v` validators
- Always check authentication with `requireAuth`
- Scope all queries/mutations by `accountId`
- Log activities for important state changes

### Styling

- Use Tailwind CSS utility classes
- Follow mobile-first responsive design
- Use shadcn/ui components when available

## Testing

### Running Tests

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Build verification
npm run build
```

### Writing Tests

- Place unit tests next to the code they test
- Use descriptive test names
- Test edge cases and error conditions

## Releases and changelog

We use [Changesets](https://github.com/changesets/changesets) for versioning and changelog generation. When your change affects a versioned package or app, add a changeset with `npx changeset` and commit the new file under `.changeset/`. The Release workflow runs on the release branch and opens a "Version Packages" PR. See [docs/releasing.md](docs/releasing.md) for the full list of versioned workspace members and required secrets (e.g. `NPM_TOKEN` only if publishing to npm).

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for exported functions
- Update API documentation for backend changes

## Getting Help

- Open an issue for bugs or feature requests
- Join discussions in existing issues
- Tag maintainers for urgent issues

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
