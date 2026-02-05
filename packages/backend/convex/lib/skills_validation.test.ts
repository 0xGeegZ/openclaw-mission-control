/**
 * Unit tests for skills validation (contentMarkdown size limit).
 */
import { describe, it, expect } from "vitest";
import {
  CONTENT_MARKDOWN_MAX_BYTES,
  validateContentMarkdown,
} from "./skills_validation";

describe("validateContentMarkdown", () => {
  it("accepts undefined and empty string", () => {
    expect(() => validateContentMarkdown(undefined)).not.toThrow();
    expect(() => validateContentMarkdown("")).not.toThrow();
  });

  it("accepts content within limit", () => {
    expect(() =>
      validateContentMarkdown("# Skill\n\nShort body."),
    ).not.toThrow();
    const atLimit = "x".repeat(CONTENT_MARKDOWN_MAX_BYTES);
    expect(() => validateContentMarkdown(atLimit)).not.toThrow();
  });

  it("throws when content exceeds limit", () => {
    const overLimit = "x".repeat(CONTENT_MARKDOWN_MAX_BYTES + 1);
    expect(() => validateContentMarkdown(overLimit)).toThrow(
      /contentMarkdown exceeds maximum length/,
    );
    expect(() => validateContentMarkdown(overLimit)).toThrow(
      `${CONTENT_MARKDOWN_MAX_BYTES} bytes`,
    );
  });

  it("counts UTF-8 bytes not code units", () => {
    const oneEmoji = "🔥";
    const bytes = new TextEncoder().encode(oneEmoji).length;
    expect(bytes).toBeGreaterThan(1);
    const manyEmojis = oneEmoji.repeat(
      Math.floor(CONTENT_MARKDOWN_MAX_BYTES / bytes) + 1,
    );
    expect(() => validateContentMarkdown(manyEmojis)).toThrow();
  });
});
