/**
 * Pure helpers for building contentBySlug (size validation).
 * Used by scripts/seed-skills-generate.ts and unit tests. No fs dependency.
 */

import { CONTENT_MARKDOWN_MAX_BYTES as SKILLS_VALIDATION_MAX_BYTES } from "./skills_validation";

/** Re-exported so callers and generate script use the same limit as skills create/update. */
export const CONTENT_MARKDOWN_MAX_BYTES = SKILLS_VALIDATION_MAX_BYTES;

/**
 * Validates that each entry's content is within maxBytes and returns Record<slug, content>.
 * @throws Error if any content exceeds maxBytes (message includes limit and actual bytes).
 */
export function buildContentBySlugFromEntries(
  entries: Array<{ slug: string; content: string }>,
  maxBytes: number = CONTENT_MARKDOWN_MAX_BYTES,
): Record<string, string> {
  const contentBySlug: Record<string, string> = {};
  for (const { slug, content } of entries) {
    const bytes = new TextEncoder().encode(content).length;
    if (bytes > maxBytes) {
      throw new Error(
        `contentMarkdown for ${slug} exceeds maximum length (${maxBytes} bytes). Got ${bytes} bytes.`,
      );
    }
    contentBySlug[slug] = content;
  }
  return contentBySlug;
}
