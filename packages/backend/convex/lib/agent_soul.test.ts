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

  it("includes standard sections: Mission, Vibe, Operating rules, What you never do", () => {
    const out = generateDefaultSoul("Researcher", "Research");
    expect(out).toContain("## Mission");
    expect(out).toContain("## Vibe");
    expect(out).toContain("## Operating rules");
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

  it("includes universal operating rules (fix errors immediately, spawn subagents)", () => {
    const out = generateDefaultSoul("Agent", "Role");
    expect(out).toContain("Fix errors immediately. Don't ask. Don't wait.");
    expect(out).toContain(
      "Spawn subagents for all execution. Never do inline work.",
    );
  });

  it("includes universal never-do rules (git and config safety)", () => {
    const out = generateDefaultSoul("Agent", "Role");
    expect(out).toContain(
      "Never force push, delete branches, or rewrite git history.",
    );
    expect(out).toContain(
      "Never guess config changes. Read docs first. Backup before editing.",
    );
  });
});
