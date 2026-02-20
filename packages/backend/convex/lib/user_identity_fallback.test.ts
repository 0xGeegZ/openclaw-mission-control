/**
 * Unit tests for USER/IDENTITY fallback content builders.
 * Used by migration and runtime payload when account/agent content is missing.
 */

import { describe, it, expect } from "vitest";
import {
  buildDefaultUserContent,
  buildDefaultIdentityContent,
} from "./user_identity_fallback";

describe("buildDefaultUserContent", () => {
  it("returns non-empty string", () => {
    const content = buildDefaultUserContent();
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(0);
  });

  it("includes USER heading and Settings hint", () => {
    const content = buildDefaultUserContent();
    expect(content).toContain("# User");
    expect(content).toContain("Settings");
    expect(content).toContain("Agent Profile");
  });

  it("is deterministic (same output on repeated calls)", () => {
    expect(buildDefaultUserContent()).toBe(buildDefaultUserContent());
  });
});

describe("buildDefaultIdentityContent", () => {
  it("returns non-empty string with name and role", () => {
    const content = buildDefaultIdentityContent("QA", "Quality assurance");
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain("QA");
    expect(content).toContain("Quality assurance");
  });

  it("includes IDENTITY heading and AGENTS/HEARTBEAT reference", () => {
    const content = buildDefaultIdentityContent("Dev", "Developer");
    expect(content).toContain("# IDENTITY");
    expect(content).toContain("AGENTS.md");
    expect(content).toContain("HEARTBEAT.md");
  });

  it("interpolates name and role in body", () => {
    const content = buildDefaultIdentityContent("Squad Lead", "Orchestrator");
    expect(content).toContain("Squad Lead");
    expect(content).toContain("Orchestrator");
    expect(content).toContain("**Squad Lead**");
  });

  it("is deterministic for same inputs", () => {
    const a = buildDefaultIdentityContent("A", "B");
    const b = buildDefaultIdentityContent("A", "B");
    expect(a).toBe(b);
  });

  it("differs for different name or role", () => {
    const one = buildDefaultIdentityContent("QA", "Reviewer");
    const two = buildDefaultIdentityContent("Dev", "Reviewer");
    const three = buildDefaultIdentityContent("QA", "Developer");
    expect(one).not.toBe(two);
    expect(one).not.toBe(three);
  });
});
