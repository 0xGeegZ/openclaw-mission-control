import { describe, expect, it } from "vitest";

import { scoreTaskSearchRelevance } from "./tasks";

describe("scoreTaskSearchRelevance", () => {
  it("returns 0 for empty or whitespace query", () => {
    const task = {
      title: "Deploy API",
      description: "Ship v2",
      blockedReason: "Waiting for PR #8",
    };

    expect(scoreTaskSearchRelevance(task, "")).toBe(0);
    expect(scoreTaskSearchRelevance(task, "   ")).toBe(0);
  });

  it("weights title > description > blockedReason", () => {
    const titleMatch = {
      title: "Deploy API",
      description: "Unrelated",
      blockedReason: "Unrelated",
    };
    const descMatch = {
      title: "Unrelated",
      description: "Deploy API",
      blockedReason: "Unrelated",
    };
    const blockedMatch = {
      title: "Unrelated",
      description: "Unrelated",
      blockedReason: "Deploy API",
    };

    expect(scoreTaskSearchRelevance(titleMatch, "deploy api")).toBe(3);
    expect(scoreTaskSearchRelevance(descMatch, "deploy api")).toBe(2);
    expect(scoreTaskSearchRelevance(blockedMatch, "deploy api")).toBe(1);
  });

  it("sums scores when query appears in multiple fields", () => {
    const task = {
      title: "Deploy API",
      description: "Deploy API after QA",
      blockedReason: "Deploy API blocked by PR #42",
    };

    expect(scoreTaskSearchRelevance(task, "deploy api")).toBe(6);
  });

  it("matches case-insensitively and treats special chars literally", () => {
    const task = {
      title: "Fix [urgent] deploy issue",
      description: "Pattern (a+) in logs",
      blockedReason: "PR #100",
    };

    expect(scoreTaskSearchRelevance(task, "[URGENT]")).toBe(3);
    expect(scoreTaskSearchRelevance(task, "(a+)")).toBe(2);
    expect(scoreTaskSearchRelevance(task, "PR #100")).toBe(1);
  });
});
