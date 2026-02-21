/**
 * Canonical prompt fragments for agent instructions.
 * Use these constants everywhere the same wording is needed to avoid drift.
 *
 * Usage (use the constant; do not rephrase):
 * - SKILLS_LOCATION_SENTENCE: DEFAULT_AGENTS_MD, buildToolsMd header, delivery workspaceInstruction, DEFAULT_HEARTBEAT_MD, get_agent_skills tool description. Manually mirror in docs/runtime/AGENTS.md.
 * - NO_APPLICABLE_SKILL_PHRASE: DEFAULT_AGENTS_MD, buildToolsMd header, DEFAULT_HEARTBEAT_MD. Manually mirror in docs/runtime/AGENTS.md.
 * - SESSIONS_SPAWN_PARENT_SKILL_RULE: DEFAULT_AGENTS_MD, delivery scopeRules. Manually mirror in docs/runtime/AGENTS.md.
 */

/** Where assigned skills live; do not look in config directory. */
export const SKILLS_LOCATION_SENTENCE =
  "Skills live in your workspace (TOOLS.md and `skills/<slug>/SKILL.md`), not in /root/.openclaw/ (config directory).";

/** Phrase agents must use when no assigned skill applies. */
export const NO_APPLICABLE_SKILL_PHRASE = "No applicable skill";

/** Parent-skill-context rule for sessions_spawn: default omit agentId; pass agentId only for intentional cross-specialist delegation. */
export const SESSIONS_SPAWN_PARENT_SKILL_RULE =
  "By default do not pass agentId to sessions_spawn so the sub-agent keeps your skills and context; pass agentId only when intentionally delegating to a different specialist.";

/**
 * Assignment first-reply rule: ack only, no substantive work or sessions_spawn in this reply.
 * Used in buildDeliveryInstructions (top block + scope) and buildNotificationInput (assignment tail).
 */
export const ASSIGNMENT_ACK_ONLY_RULE =
  "You MUST reply with only a short acknowledgment (1–2 sentences) and optional clarifying questions. Do NOT perform substantive work, use the full Summary/Work done/Artifacts format, or call sessions_spawn in this reply. Substantive work happens on a later notification after this ack is posted.";

/** Scope rule exception for assignment: this notification's reply must be ack only. */
export const ASSIGNMENT_SCOPE_ACK_ONLY_RULE =
  "On assignment notifications, your only reply for this notification must be the short acknowledgment; do not do substantive work or spawn sub-agents in this reply.";
