/**
 * Pure helpers for task thread "Seen by" and typing indicator derivation.
 * Used by TaskThread and tested in isolation.
 */

/** Minimal agent shape for indicator derivation (compatible with ReadByAgent). */
export type AgentLike = {
  id: string;
  name: string;
  avatarUrl?: string;
  icon?: string;
};

/**
 * Hybrid Seen by: strict (read latest user message) first, then reply-based fallback, then typing agents for this task.
 */
export function getEffectiveReadByAgents(
  strictSeenByAgents: AgentLike[],
  fallbackReadByAgents: AgentLike[],
  typingAgents: AgentLike[],
): AgentLike[] {
  if (strictSeenByAgents.length > 0) return strictSeenByAgents;
  if (fallbackReadByAgents.length > 0) return fallbackReadByAgents;
  return typingAgents;
}

/**
 * Typing indicator is shown when there is at least one task-scoped typing agent (no Seen-by gate).
 */
export function getShouldShowTypingIndicator(
  effectiveTypingAgents: AgentLike[],
): boolean {
  return effectiveTypingAgents.length > 0;
}
