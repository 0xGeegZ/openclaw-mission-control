/**
 * Fallback content for account USER.md and per-agent IDENTITY.md when not set.
 * Used by migration and by runtime payload (effectiveUserMd / effectiveIdentityContent).
 */

/** Default account-shared USER content when settings.userMd is missing. */
export function buildDefaultUserContent(): string {
  return `# User

Account context. Edit this in **Settings > Agent Profile** to describe your team, repo, and workflow for all agents.`;
}

/**
 * Default per-agent IDENTITY content when identityContent is missing.
 * @param name - Agent display name
 * @param role - Agent role description
 */
export function buildDefaultIdentityContent(name: string, role: string): string {
  return `# IDENTITY — ${name}

Role: ${role}

You are **${name}**, a specialist agent. Operate within the task and tool rules defined in AGENTS.md and HEARTBEAT.md.`;
}
