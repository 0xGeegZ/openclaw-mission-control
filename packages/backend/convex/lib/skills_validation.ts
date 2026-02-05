/**
 * Validation helpers for skills (e.g. contentMarkdown size limit).
 * Used by skills create/update to avoid storing oversized content in Convex.
 */

/** Maximum allowed size in bytes for skill contentMarkdown (512 KB). */
export const CONTENT_MARKDOWN_MAX_BYTES = 512 * 1024;

/**
 * Validates contentMarkdown length. Throws if over CONTENT_MARKDOWN_MAX_BYTES.
 * Pass undefined or empty string to skip (optional field).
 * @throws Error with message including limit and actual byte count when over limit.
 */
export function validateContentMarkdown(content: string | undefined): void {
  if (content === undefined || content === "") return;
  const bytes = new TextEncoder().encode(content).length;
  if (bytes > CONTENT_MARKDOWN_MAX_BYTES) {
    throw new Error(
      `contentMarkdown exceeds maximum length (${CONTENT_MARKDOWN_MAX_BYTES} bytes). Got ${bytes} bytes.`,
    );
  }
}
