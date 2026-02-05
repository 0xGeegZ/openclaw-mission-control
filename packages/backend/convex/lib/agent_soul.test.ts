/**
 * Unit tests for default SOUL generation (used by agent creation and runtime profile sync).
 */
import { describe, it, expect } from "vitest";
import { generateDefaultSoul } from "./agent_soul";

describe("generateDefaultSoul", () => {
  it("includes agent name and role in the SOUL header", () => {
    const out = generateDefaultSoul("Engineer", "Backend developer");
    expect(out).toContain("# SOUL — Engineer");
    expect(out).toContain("Role: Backend developer");
  });

  it("includes standard sections: Mission, Personality constraints, Default operating procedure", () => {
    const out = generateDefaultSoul("Researcher", "Research");
    expect(out).toContain("## Mission");
    expect(out).toContain("## Personality constraints");
    expect(out).toContain("## Default operating procedure");
    expect(out).toContain("## Quality checks");
    expect(out).toContain("## What you never do");
  });

  it("includes Level: specialist", () => {
    const out = generateDefaultSoul("Agent", "Role");
    expect(out).toContain("Level: specialist");
  });

  it("produces consistent content for same inputs", () => {
    const a = generateDefaultSoul("A", "R");
    const b = generateDefaultSoul("A", "R");
    expect(a).toBe(b);
  });

  it("differs when name or role changes", () => {
    const a = generateDefaultSoul("Alice", "Dev");
    const b = generateDefaultSoul("Bob", "Dev");
    const c = generateDefaultSoul("Alice", "QA");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});
