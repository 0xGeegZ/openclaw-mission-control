/**
 * Canonical mention token regex shared by backend and web rendering.
 * - @"full name"
 * - @word
 * - @word-word
 * - @word word word (resolved by longest known prefix)
 */
export const MENTION_TOKEN_REGEX = /@(?:"([^"]+)"|(\w+(?:[\s-]\w+)*))/g;
const SIMPLE_MENTION_REGEX = /@(\w+(?:-\w+)*|"[^"]+")/g;

/**
 * Strip quoted/cited content so mention parsing applies only to new message body.
 * Removes fenced code blocks, inline code, and blockquoted lines.
 */
export function stripQuotedContentForMentions(content: string): string {
  const withoutFences = content.replace(/```[\s\S]*?```/g, "");
  const withoutInlineCode = withoutFences.replace(/`[^`]*`/g, "");
  return withoutInlineCode
    .split("\n")
    .filter((line) => !line.trim().startsWith(">"))
    .join("\n");
}

/**
 * Extract normalized mention candidates from a text string.
 * The caller controls whether the text is raw or already sanitized.
 */
export function extractMentionCandidatesFromText(text: string): string[] {
  const matches: string[] = [];
  const re = new RegExp(MENTION_TOKEN_REGEX.source, MENTION_TOKEN_REGEX.flags);
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const candidate = (match[1] ?? match[2] ?? "").trim().toLowerCase();
    if (candidate) matches.push(candidate);
  }

  return matches;
}

/**
 * Extract normalized mention candidates from message content after sanitizing
 * quoted/cited/code sections.
 */
export function extractMentionCandidates(content: string): string[] {
  return extractMentionCandidatesFromText(
    stripQuotedContentForMentions(content),
  );
}

/**
 * Legacy/simple extractor used for strict token parsing:
 * - @word
 * - @word-word
 * - @"full name"
 */
export function extractSimpleMentionStrings(content: string): string[] {
  const sanitized = stripQuotedContentForMentions(content);
  const matches = sanitized.match(SIMPLE_MENTION_REGEX) || [];
  return matches.map((raw) => {
    let mention = raw.slice(1);
    if (mention.startsWith('"') && mention.endsWith('"')) {
      mention = mention.slice(1, -1);
    }
    return mention.toLowerCase();
  });
}

/**
 * Return the longest known key that exactly matches or prefixes the captured chunk.
 * Used for unquoted multi-word mentions like:
 * "@guillaume dieudonne before merge" -> "guillaume dieudonne".
 */
export function findLongestMentionKey(
  captured: string,
  sortedKeys: string[],
): string | null {
  const normalized = captured.trim().toLowerCase();
  if (!normalized) return null;

  for (const key of sortedKeys) {
    if (normalized === key) return key;
    if (normalized.startsWith(key + " ") || normalized.startsWith(key + "\n")) {
      return key;
    }
  }

  return null;
}

/**
 * Sort keys by descending length so longest-prefix resolution is deterministic.
 */
export function sortMentionKeysByLengthDesc(keys: string[]): string[] {
  return [...keys].sort((a, b) => b.length - a.length);
}
