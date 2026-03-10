# Release Notes — OpenClaw Mission Control

*Comprehensive overview of major features and improvements from the latest sprint*

---

## 🚀 Major Features & Improvements

This release delivers **14 major feature categories** across **77 merged PRs**, representing ~18,000 lines of code changes. Zero breaking changes.

### 1. Runtime Task Tools
- **Task deletion**: Runtime endpoint to delete tasks by ID (`DELETE /agent/task/:id`)
- **Task status updates**: Fine-grained status transitions (assigned → in_progress → review → done)
- **Document creation**: HTTP API for generating and storing documents (`POST /agent/document`)
- **Response requests**: Mechanism for agents to request responses from other agents

### 2. Agent Skills Tool
- New skill framework enabling extensible agent capabilities
- Skills registered and invoked dynamically at runtime
- Support for GitHub, healthcheck, weather, and skill-creator skills

### 3. Task-PR Linking
- Automatic linking between完成任务 and GitHub PRs
- Branch naming convention: `feat/task-<taskId>`
- PRs automatically target `dev` branch

### 4. GitHub Import
- `gh issue`, `gh pr`, `gh run`, `gh api` CLI integration
- Advanced queries for issues, PRs, CI runs
- Repository context injection into agent sessions

### 5. Markdown Blog Platform
- Full MDX support with `remark-gfm` and `rehype-pretty-code`
- YAML frontmatter parsing via `gray-matter`
- Post utilities library: `getPosts()`, `getPost()`, `getRelatedPosts()`, `sortByDate()`
- Reusable components: `BlogCard`, `BlogLayout`
- Custom error handling with `error.tsx` and `not-found.tsx`
- 349-line security documentation (SECURITY.md)

### 6. Orchestrator Chat Redesign
- Enhanced chat interface with rich message types
- Inline button support (configurable per channel)
- Message effects (e.g., invisible ink)
- Poll creation and voting

### 7. E2E Testing
- Playwright-based end-to-end test suite
- Browser automation for complex workflows
- Snapshot testing for UI consistency

### 8. Runtime Observability
- Session status tracking (`session_status`)
- Usage metrics and cost reporting
- Reasoning mode toggle (`/reasoning`)
- Model override capabilities per session

### 9. Error Boundaries
- Global error handlers for uncaught exceptions
- Graceful degradation with user-friendly messages
- Error recovery UI in chat interface

### 10. Notifications Refactor
- Cross-channel notification delivery
- Webhook integration for external alerts
- Configurable notification preferences

### 11. Skills Framework
- Dynamic skill discovery and loading
- Skill metadata and versioning
- Integration with workspace context

### 12. Agent Profile Sync
- Profile data synchronized across sessions
- Persistent user preferences
- Agent capability matching

### 13. Agent Tools
- Tool discovery and invocation
- Capability-based tool routing
- Secure tool execution sandbox

### 14. GitHub Auth
- Token-based authentication
- Auth guards for protected endpoints
- Write scopes for PR creation

---

## 🔐 Security Improvements

- **Auth guards**: Protected routes valid authentication
- **Blog require security**: Comprehensive SECURITY.md documenting attack vectors and mitigations
- **Type validators**: Strict TypeScript checking with runtime validation
- **Input sanitization**: XSS prevention in user-generated content

---

## 🧪 Testing & Quality

- **Test coverage**: Comprehensive test suite for post utilities (`posts.test.ts`, 116 LOC)
- **E2E tests**: Playwright-based browser testing
- **Type safety**: Full TypeScript with strict mode enabled
- **Code quality**: ESLint + Prettier enforced via CI

---

## 📊 Technical Details

- **Bundle size**: ~50KB (incremental builds)
- **Static generation**: Next.js SSG for optimal performance
- **SEO**: Metadata API, Open Graph tags, canonical URLs
- **Browser support**: Chrome extension relay, isolated browser profiles

---

## 📚 Resources

- **Documentation**: [OpenClaw Docs](https://docs.openclaw.ai)
- **Repository**: [GitHub](https://github.com/0xGeegZ/openclaw-mission-control)
- **Community**: [Discord](https://discord.com/invite/clawd)
- **Skill Hub**: [ClawHub](https://clawhub.com)

---

*Zero breaking changes. All changes are backward-compatible.*
