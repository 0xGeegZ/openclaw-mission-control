/**
 * Unit tests for buildContentBySlugFromEntries (seed skills content size validation).
 */
import { describe, it, expect } from "vitest";
import {
  CONTENT_MARKDOWN_MAX_BYTES,
  buildContentBySlugFromEntries,
} from "./seed_skills_build";

describe("buildContentBySlugFromEntries", () => {
  it("returns correct keys and values for one or more entries", () => {
    const entries = [
      { slug: "a", content: "# A\n\nBody." },
      { slug: "b", content: "# B\n\nOther." },
    ];
    const out = buildContentBySlugFromEntries(entries);
    expect(Object.keys(out)).toEqual(["a", "b"]);
    expect(out.a).toBe("# A\n\nBody.");
    expect(out.b).toBe("# B\n\nOther.");
  });

  it("accepts content at exactly max bytes", () => {
    const atLimit = "x".repeat(CONTENT_MARKDOWN_MAX_BYTES);
    const out = buildContentBySlugFromEntries([{ slug: "big", content: atLimit }]);
    expect(out.big).toBe(atLimit);
  });

  it("throws when content exceeds max bytes with clear message", () => {
    const overLimit = "x".repeat(CONTENT_MARKDOWN_MAX_BYTES + 1);
    expect(() =>
      buildContentBySlugFromEntries([{ slug: "too-big", content: overLimit }]),
    ).toThrow(/contentMarkdown for too-big exceeds maximum length/);
    expect(() =>
      buildContentBySlugFromEntries([{ slug: "too-big", content: overLimit }]),
    ).toThrow(new RegExp(`${CONTENT_MARKDOWN_MAX_BYTES} bytes`));
    expect(() =>
      buildContentBySlugFromEntries([{ slug: "too-big", content: overLimit }]),
    ).toThrow(/Got [0-9]+ bytes/);
  });

  it("accepts custom maxBytes", () => {
    const small = "hi";
    const out = buildContentBySlugFromEntries([{ slug: "s", content: small }], 10);
    expect(out.s).toBe("hi");
  });
});
