/**
 * Unified no-response detection and fallback: NO_REPLY signal, placeholder messages, and fallback text.
 * Used by delivery loop, gateway, and heartbeat.
 */

const NO_REPLY_SIGNAL_VALUES = new Set(["NO_REPLY", "NO", "NO_"]);

const NO_RESPONSE_PLACEHOLDER_MESSAGES = [
  "No response from OpenClaw.",
  "No reply from agent.",
  "No response from agent.",
];

const NO_RESPONSE_MENTION_PREFIX_PATTERN =
  /^(@[A-Za-z0-9_-]+)(\s+@[A-Za-z0-9_-]+)*$/;

/** Fallback message body when OpenClaw returns no usable response. */
export const NO_RESPONSE_FALLBACK_MESSAGE = [
  "**Summary**",
  "- OpenClaw did not return a response for this run.",
  "",
  "**Work done**",
  "- None (no output received).",
  "",
  "**Next step (one)**",
  "- Retry once the runtime or gateway is healthy; check OpenClaw logs if this persists.",
  "",
  "**Sources**",
  "- None.",
].join("\n");

/** Posted when tool execution ran but no final reply was received (e.g. follow-up request failed). */
export const FALLBACK_NO_REPLY_AFTER_TOOLS = [
  "**Summary**",
  "- Tool(s) were executed; the final reply could not be retrieved.",
  "",
  "**Work done**",
  "- Executed tool calls for this notification.",
  "",
  "**Artifacts**",
  "- None.",
  "",
  "**Risks / blockers**",
  "- If a tool reported an error (success: false), consider the task BLOCKED and do not claim status was changed.",
  "",
  "**Next step (one)**",
  "- Retry once the runtime or gateway is healthy.",
  "",
  "**Sources**",
  "- None.",
].join("\n");

/**
 * Detect explicit "no reply" signals from OpenClaw output (e.g. single-token NO_REPLY).
 * @param value - Raw text from OpenClaw (trimmed and compared to NO_REPLY, NO, NO_).
 * @returns true if value is one of the known no-reply sentinels.
 */
export function isNoReplySignal(value: string): boolean {
  return NO_REPLY_SIGNAL_VALUES.has(value.trim());
}

/**
 * Detect OpenClaw "no response" placeholder messages, including mention-only prefixes.
 * @param response - Raw response text from gateway or delivery.
 * @returns { isPlaceholder, mentionPrefix } — true if placeholder; mentionPrefix when prefixed by @mentions only.
 */
export function parseNoResponsePlaceholder(response: string): {
  isPlaceholder: boolean;
  mentionPrefix: string | null;
} {
  const trimmed = response.trim();
  if (!trimmed) return { isPlaceholder: false, mentionPrefix: null };
  if (NO_RESPONSE_PLACEHOLDER_MESSAGES.includes(trimmed)) {
    return { isPlaceholder: true, mentionPrefix: null };
  }
  const matchedSuffix = NO_RESPONSE_PLACEHOLDER_MESSAGES.find((message) =>
    trimmed.endsWith(message),
  );
  if (!matchedSuffix) {
    return { isPlaceholder: false, mentionPrefix: null };
  }
  const prefix = trimmed.slice(0, trimmed.length - matchedSuffix.length).trim();
  if (!prefix) return { isPlaceholder: true, mentionPrefix: null };
  if (NO_RESPONSE_MENTION_PREFIX_PATTERN.test(prefix)) {
    return { isPlaceholder: true, mentionPrefix: prefix };
  }
  return { isPlaceholder: false, mentionPrefix: null };
}

/**
 * Build a fallback response for placeholder or no-response OpenClaw runs.
 * @param mentionPrefix - Optional @mention prefix to prepend (e.g. when placeholder was mention-prefixed).
 * @returns Formatted fallback message for posting to the thread.
 */
export function buildNoResponseFallbackMessage(
  mentionPrefix?: string | null,
): string {
  const prefix = mentionPrefix ? `${mentionPrefix.trim()}\n\n` : "";
  return `${prefix}${NO_RESPONSE_FALLBACK_MESSAGE}`;
}

/**
 * Detect fallback messages generated for no-response OpenClaw runs (plain or mention-prefixed).
 * @param content - Message content to check.
 * @returns true if content equals or ends with NO_RESPONSE_FALLBACK_MESSAGE (with optional mention prefix).
 */
export function isNoResponseFallbackMessage(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (trimmed === NO_RESPONSE_FALLBACK_MESSAGE) return true;
  if (!trimmed.endsWith(NO_RESPONSE_FALLBACK_MESSAGE)) return false;
  const prefix = trimmed
    .slice(0, trimmed.length - NO_RESPONSE_FALLBACK_MESSAGE.length)
    .trim();
  return !prefix || NO_RESPONSE_MENTION_PREFIX_PATTERN.test(prefix);
}
