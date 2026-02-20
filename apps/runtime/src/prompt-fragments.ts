/**
 * Canonical prompt fragments for agent instructions.
 * Keep in sync across DEFAULT_AGENTS_MD, buildToolsMd, delivery workspaceInstruction,
 * HEARTBEAT, get_agent_skills tool description, and docs/runtime/AGENTS.md.
 */

/** Where assigned skills live; do not look in config directory. Used in AGENTS.md, TOOLS.md header, delivery prompt, HEARTBEAT. */
export const SKILLS_LOCATION_SENTENCE =
  "Skills live in your workspace (TOOLS.md and `skills/<slug>/SKILL.md`), not in /root/.openclaw/ (config directory).";

/** Phrase agents must use when no assigned skill applies. Used in AGENTS.md, TOOLS.md header, HEARTBEAT. */
export const NO_APPLICABLE_SKILL_PHRASE = "No applicable skill";
