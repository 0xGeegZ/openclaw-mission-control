import { describe, it, expect } from "vitest";
import {
  buildNoResponseFallbackMessage,
  isNoResponseFallbackMessage,
  parseNoResponsePlaceholder,
} from "./gateway";
import { isHeartbeatOkResponse } from "./heartbeat-constants";

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

describe("isNoResponseFallbackMessage", () => {
  it("detects plain fallback text", () => {
    const message = buildNoResponseFallbackMessage();
    expect(isNoResponseFallbackMessage(message)).toBe(true);
  });

  it("detects mention-prefixed fallback text", () => {
    const message = buildNoResponseFallbackMessage("@squad-lead @engineer");
    expect(isNoResponseFallbackMessage(message)).toBe(true);
  });

  it("ignores regular messages", () => {
    expect(isNoResponseFallbackMessage("Working on it, update soon.")).toBe(
      false,
    );
  });
});

describe("isHeartbeatOkResponse", () => {
  it("detects exact HEARTBEAT_OK", () => {
    expect(isHeartbeatOkResponse("HEARTBEAT_OK")).toBe(true);
  });

  it("detects HEARTBEAT_OK with heartbeat loading prelude", () => {
    expect(
      isHeartbeatOkResponse("Loading context for heartbeat...\n\nHEARTBEAT_OK"),
    ).toBe(true);
  });

  it("does not suppress non-heartbeat responses", () => {
    expect(
      isHeartbeatOkResponse("Loading context for notification...\nHEARTBEAT_OK"),
    ).toBe(false);
  });
});
