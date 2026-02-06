import { describe, it, expect } from "vitest";
import {
  buildNoResponseFallbackMessage,
  parseNoResponsePlaceholder,
} from "./gateway";

describe("parseNoResponsePlaceholder", () => {
  it("detects the plain placeholder", () => {
    const result = parseNoResponsePlaceholder("No response from OpenClaw.");
    expect(result.isPlaceholder).toBe(true);
    expect(result.mentionPrefix).toBe(null);
  });

  it("detects mention-only prefixes", () => {
    const result = parseNoResponsePlaceholder(
      "@squad-lead @engineer No response from OpenClaw.",
    );
    expect(result.isPlaceholder).toBe(true);
    expect(result.mentionPrefix).toBe("@squad-lead @engineer");
  });

  it("ignores non-mention prefixes", () => {
    const result = parseNoResponsePlaceholder(
      "Something else. No response from OpenClaw.",
    );
    expect(result.isPlaceholder).toBe(false);
    expect(result.mentionPrefix).toBe(null);
  });
});

describe("buildNoResponseFallbackMessage", () => {
  it("includes mention prefix when provided", () => {
    const message = buildNoResponseFallbackMessage("@squad-lead");
    expect(message.startsWith("@squad-lead\n\n")).toBe(true);
  });
});
