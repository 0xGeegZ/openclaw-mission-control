# OpenClaw config – security audit

Focused review of OpenClaw-related configuration and data flow to avoid security issues. Aligns with the project security-audit skill (dependencies, auth, input validation, data protection, infrastructure).

---

## 1. Summary

| Area | Finding | Severity | Status |
|------|--------|----------|--------|
| Gateway URL | `file://` and non-http(s) URLs accepted | Medium | Done |
| Gateway token | Required for non-local hosts; redacted in logs | OK | — |
| `updateOpenclawConfig` | No bounds on temperature, maxTokens, string lengths | Medium | Done |
| Account `agentDefaults` | temperature/maxTokens not bounded | Low | Done |
| Profile sync paths | Slugs sanitized; paths kept under workspace | OK | — |
| start-openclaw.sh | `workspace-$id` from config; id not sanitized | Low | Done |
| Session key | Logged in debug; embedded in agent instructions by design | Low | Done (redact in logs) |

---

## 2. Dependency / config surface

- **Runtime** reads: `OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN`, `OPENCLAW_WORKSPACE_ROOT`, `OPENCLAW_REQUEST_TIMEOUT_MS`, etc.
- **Convex** stores `agents.openclawConfig` and `accounts.settings.agentDefaults` (both validated by schema; mutation validators vary).
- **OpenClaw gateway** startup script merges runtime-generated `openclaw.json` and env (e.g. `GH_TOKEN`, `BRAVE_API_KEY`) into `/root/.openclaw/openclaw.json`.

No dependency audit was run; run `npm audit` in each app/package as part of broader hardening.

---

## 3. Authentication & authorization

- **Convex**
  - `agents.updateOpenclawConfig`: `requireAccountAdmin(ctx, agent.accountId)` — only account admins can change OpenClaw config. OK.
  - `accounts.update` (including `settings.agentDefaults`): `requireAccountAdmin`. OK.
  - Service actions (`listAgentsForRuntime`, `getNotificationForDelivery`, etc.): `requireServiceAuth(ctx, args.serviceToken)` and account scoping. OK.
- **Runtime**
  - Gateway URL/token are process env; no auth on the gateway URL itself.
  - Health `/agent/*` endpoints: local-only (e.g. `isLocalAddress(remoteAddress)`), then session key from `x-openclaw-session-key` resolved via `getAgentIdForSessionKey(sessionKey)` (session must be in runtime’s session map). OK.
- **Gateway token**
  - Non-local `OPENCLAW_GATEWAY_URL` requires `OPENCLAW_GATEWAY_TOKEN` (config load throws otherwise). Token is redacted in `getGatewayState()`. OK.

---

## 4. Input validation & sanitization

### 4.1 Gateway URL (runtime)

- **Issue:** `parseOpenClawGatewayUrl()` only checks `new URL(trimmed)`. So `file:///etc/passwd`, `ftp://host`, etc. are accepted. Sending to `file://` is useless and can be misleading or abused in scripts.
- **Remediation:** Restrict to `http:` and `https:` only. Reject others at config load.

### 4.2 `agents.updateOpenclawConfig`

- **Current:** Model is validated against `AVAILABLE_MODELS`; `skillIds` are checked to exist, same account, and enabled. Good.
- **Gaps:**
  - `temperature`: schema is `v.number()` but no range. OpenClaw/docs typically use 0–2. Without a clamp, extreme values could affect behavior or downstream APIs.
  - `maxTokens`: no minimum/maximum (e.g. 1–128000 or similar).
  - `systemPromptPrefix`: no max length; very long strings could bloat storage and prompts.
  - `contextConfig.customContextSources`: array of strings with no length or element size limit.
  - `behaviorFlags.requiresApprovalForActions`: array of strings with no length or element size limit.
- **Remediation:** Add explicit bounds and length limits in the mutation handler (and optionally in Convex validators): e.g. temperature in [0, 2], maxTokens in [1, 128000], systemPromptPrefix max length (e.g. 4_000), and reasonable array/length limits for `customContextSources` and `requiresApprovalForActions`.

### 4.3 Account `agentDefaults` (accounts.update)

- **Current:** `agentDefaults.model` is validated against `AVAILABLE_MODELS`. Temperature and maxTokens are not bounded.
- **Remediation:** Apply the same temperature and maxTokens bounds as in `updateOpenclawConfig` when `agentDefaults` is present.

### 4.4 Profile sync (runtime) – paths and slugs

- **Current:** `safeAgentSlug` / `safeSkillSlug` (alphanumeric, hyphen, underscore only; no `..`, no path separators). `resolveAgentDir()` ensures the agent dir stays under `workspaceRoot`. `buildOpenClawConfig` only uses agents that passed this validation. So written paths are under the intended workspace. OK.
- **Recommendation:** Keep a single implementation for “slug safe for path” (already shared between agent and skill) and use it for any new config keys that end up in paths.

### 4.5 start-openclaw.sh – `workspace-$id`

- **Current:** `ensureAgentSessionDirs` uses `jq -r '.agents.list[]?.id // empty'` and does `mkdir -p "$CONFIG_DIR/workspace-$id"`. If a malicious `id` (e.g. `../foo` or `$(...)`) were in the merged config, this could be path traversal or command substitution. In normal flow, the runtime only writes ids from `safeAgentSlug`, so generated config is safe. Risk is if the config file is tampered (e.g. volume mount) or env is abused.
- **Remediation:** Sanitize each `id` before use: allow only `[a-zA-Z0-9_-]+`; skip or reject any other value so `workspace-$id` never escapes `CONFIG_DIR`.

---

## 5. Data protection

- **Secrets**
  - Gateway token: not logged (redacted in `getGatewayState()`). OK.
  - Session key: used in headers and in agent instructions (by design for HTTP fallback). It is logged in `log.debug("Sending to", sessionKey, ...)` and in error paths (e.g. `Unknown session: ${sessionKey}`). In production, debug may be off, but logging the full key is unnecessary.
- **Remediation:** Redact session key in logs (e.g. first 4 chars + `…`), same as in health.ts for the agent endpoint.

- **Sensitive data in responses**
  - Service actions return `openclawConfig` (model, temperature, skillIds, behaviorFlags, etc.) to the runtime. No secrets in that object. OK.

---

## 6. Infrastructure

- **OPENCLAW_GATEWAY_URL**: Should be set to the intended gateway (e.g. `http://127.0.0.1:18789` or `http://openclaw-gateway:18789` in Docker). Restricting to http(s) avoids misuse (see 4.1).
- **OPENCLAW_WORKSPACE_ROOT**: Used to derive `openclawConfigPath` and workspace paths. Runtime uses `path.resolve` and `path.relative` to keep paths under the workspace. start-openclaw.sh uses this env for merge path; sanitizing `id` when creating `workspace-$id` limits impact of a bad config (see 4.5).
- **CORS / security headers**: Not in scope for this OpenClaw-config audit; health server is local-only.

---

## 7. Checklist (OpenClaw config focus)

- [x] No hardcoded secrets in OpenClaw config path (token from env; redacted in logs).
- [x] AuthZ on Convex mutations (admin for agent/account config; service token for runtime).
- [x] Model and skillIds validated in `updateOpenclawConfig`.
- [x] Profile sync path/slug sanitization (safeAgentSlug, resolveAgentDir).
- [x] Gateway URL restricted to http(s) (remediation below; tested in apps/runtime/src/__tests__/config.test.ts).
- [x] Bounds on temperature, maxTokens, and string/array lengths in `updateOpenclawConfig` (remediation below; validated via `validateOpenclawConfigBounds`, tested in packages/backend/convex/agents.openclaw-config.test.ts).
- [x] Same bounds for account `agentDefaults`; sanitize `id` in start-openclaw.sh; redact session key in runtime logs.

---

## 8. Remediations (code)

**Status:** 8.1 and 8.2 are implemented and covered by unit tests. 8.3 (session key redaction) and 8.4 (start-openclaw.sh id sanitization) are implemented.

### 8.1 Restrict gateway URL to http(s) (apps/runtime/src/config.ts)

In `parseOpenClawGatewayUrl()`, after `new URL(trimmed)`:

- If `url.protocol` is not `http:` or `https:`, throw a clear error (e.g. `Invalid OPENCLAW_GATEWAY_URL. Only http and https are allowed.`).

### 8.2 Bounds in agents.updateOpenclawConfig (packages/backend/convex/agents.ts)

In the handler, after existing model/skillIds checks:

- **temperature:** If not in [0, 2], throw (e.g. `Invalid temperature: must be between 0 and 2`).
- **maxTokens:** If present and (not a positive integer or &gt; 128000), throw (adjust 128000 to match your max model context if different).
- **systemPromptPrefix:** If present and length &gt; 4000, throw (or use a shared constant).
- **contextConfig.customContextSources:** If present, ensure array length ≤ e.g. 20 and each element length ≤ 200 (or your chosen limits).
- **behaviorFlags.requiresApprovalForActions:** If present, same idea: cap array length and per-element length.

Optionally, add the same numeric/string bounds to the Convex validators so invalid data is rejected at the API boundary.

### 8.3 (Optional) Redact session key in gateway/delivery logs

- In `gateway.ts`: where `log.debug("Sending to", sessionKey, ...)` and any `throw new Error(\`Unknown session: ${sessionKey}\`)` (or similar) are used, replace the logged/displayed value with a redacted form (e.g. `${sessionKey.slice(0, 4)}…`).
- In `delivery.ts`: if session key is ever logged, redact the same way.

### 8.4 (Optional) start-openclaw.sh – sanitize agent id

Before `mkdir -p "$CONFIG_DIR/workspace-$id"`:

- Ensure `id` matches `^[a-zA-Z0-9_-]+$` (e.g. with a short shell check or `jq` filter). If it does not, skip that id or exit with an error so no `workspace-$id` is created for invalid ids.

---

## 9. References

- Runtime config: `apps/runtime/src/config.ts`
- Gateway state and send: `apps/runtime/src/gateway.ts`
- Profile sync and slug safety: `apps/runtime/src/openclaw-profiles.ts`
- Convex schema (agents, accounts): `packages/backend/convex/schema.ts`
- Mutations: `packages/backend/convex/agents.ts`, `packages/backend/convex/accounts.ts`
- OpenClaw startup and merge: `apps/runtime/openclaw/start-openclaw.sh`
