---
date: 2026-02-21
topic: agent-web-search-and-fetch
---

# Agent Web Search and URL Fetch (Both)

## What We're Building

Agents should be able to (1) **search the web** when they don't have a URL (e.g. "latest Next.js 16 docs", "how to X") and (2) **fetch specific public URLs** when they have a link (e.g. a doc page, a repo). We keep security: they must not use URL fetch on the runtime or any internal host (SSRF protection).

## Why This Approach

OpenClaw already provides:

- **web_search**: enabled when `BRAVE_API_KEY` is set in the gateway env (start-openclaw.sh). Returns search results/snippets.
- **web_fetch**: enabled by default; fetches a URL and extracts content. **Blocked for private/internal IPs** (SSRF guard). So agents can fetch public URLs today; the failure we saw was from using web_fetch on the runtime URL (`http://runtime:3000`), which resolves to a private Docker IP.

So "enable both" means:

1. **Web search**: Ensure Brave (or optional Perplexity) is enabled via env and documented so operators set the key.
2. **Web fetch**: Keep default behavior (public URLs allowed). Add a **prompt rule** so agents and subagents never use web_fetch on the runtime base URL or internal hosts—they must use only the documented POST /agent/\* HTTP fallback or runtime tools for those. That avoids "Blocked: resolves to private/internal IP address" without relaxing SSRF.

No change to OpenClaw SSRF policy; no new tools in our runtime payload. Gateway-level web tools stay as-is; we only add env (for search) and one scoped prohibition in the delivery prompt (for fetch).

## Key Decisions

- **Web search**: Rely on existing Brave integration (BRAVE_API_KEY in gateway env). Document in README and .env.example. Optionally document Perplexity/OpenRouter as an alternative for AI-synthesized search answers (implementation can be later).
- **Web fetch**: Keep for public URLs. Add a single prompt fragment (e.g. WEB_FETCH_RUNTIME_PROHIBITED) and inject it into the delivery instructions so agents/subagents are told: do not use web_fetch on the runtime base URL or internal hosts; use POST /agent/\* with x-openclaw-session-key or runtime tools only for those.
- **No tool allowlisting in runtime**: We don't need to add web_search/web_fetch to the tools we send; the gateway already exposes them to sessions. We only add the scoped prohibition in the prompt.

## Open Questions

- None at this time.

## Next Steps

→ `/workflows:plan` for implementation (env docs, prompt fragment + injection, README note).
