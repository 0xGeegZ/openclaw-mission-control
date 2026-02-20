import { describe, it, expect } from "vitest";
import { validateOpenclawConfigBounds } from "./agents";

describe("validateOpenclawConfigBounds", () => {
  const validConfig = {
    temperature: 0.7,
    maxTokens: 4096,
    systemPromptPrefix: "Short",
    contextConfig: { customContextSources: ["a", "b"] },
    behaviorFlags: { requiresApprovalForActions: ["task_delete"] },
  };

  it("accepts valid config", () => {
    expect(() => validateOpenclawConfigBounds(validConfig)).not.toThrow();
  });

  it("rejects temperature below 0", () => {
    expect(() =>
      validateOpenclawConfigBounds({ ...validConfig, temperature: -0.1 }),
    ).toThrow(/Invalid temperature/);
  });

  it("rejects temperature above 2", () => {
    expect(() =>
      validateOpenclawConfigBounds({ ...validConfig, temperature: 2.1 }),
    ).toThrow(/Invalid temperature/);
  });

  it("rejects maxTokens below 1", () => {
    expect(() =>
      validateOpenclawConfigBounds({ ...validConfig, maxTokens: 0 }),
    ).toThrow(/Invalid maxTokens/);
  });

  it("rejects maxTokens above 128000", () => {
    expect(() =>
      validateOpenclawConfigBounds({ ...validConfig, maxTokens: 128001 }),
    ).toThrow(/Invalid maxTokens/);
  });

  it("rejects systemPromptPrefix over 4000 chars", () => {
    expect(() =>
      validateOpenclawConfigBounds({
        ...validConfig,
        systemPromptPrefix: "x".repeat(4001),
      }),
    ).toThrow(/systemPromptPrefix exceeds/);
  });

  it("rejects customContextSources over 20 entries", () => {
    expect(() =>
      validateOpenclawConfigBounds({
        ...validConfig,
        contextConfig: { customContextSources: Array(21).fill("x") },
      }),
    ).toThrow(/customContextSources has more than 20/);
  });

  it("rejects requiresApprovalForActions entry over 200 chars", () => {
    expect(() =>
      validateOpenclawConfigBounds({
        ...validConfig,
        behaviorFlags: { requiresApprovalForActions: ["x".repeat(201)] },
      }),
    ).toThrow(/requiresApprovalForActions entry exceeds/);
  });
});
