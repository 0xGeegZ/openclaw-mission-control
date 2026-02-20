import { describe, expect, it } from "vitest";

import {
  scoreTaskSearchRelevance,
  computeCreateFromAgentAssignedAgentIds,
} from "./tasks";
import { TASK_STATUS } from "../lib/task_workflow";
import type { Id } from "../_generated/dataModel";

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

describe("computeCreateFromAgentAssignedAgentIds", () => {
  const creatorId = "agent-creator" as Id<"agents">;
  const otherId = "agent-other" as Id<"agents">;

  it("uses explicit assignees when provided", () => {
    const result = computeCreateFromAgentAssignedAgentIds(
      [otherId],
      TASK_STATUS.IN_PROGRESS,
      creatorId,
    );
    expect(result).toEqual([otherId]);
  });

  it("explicit assignees prevent creator auto-assignment", () => {
    const result = computeCreateFromAgentAssignedAgentIds(
      [otherId],
      TASK_STATUS.ASSIGNED,
      creatorId,
    );
    expect(result).toEqual([otherId]);
    expect(result).not.toContain(creatorId);
  });

  it("auto-assigns creator when status requires assignees and none provided", () => {
    expect(
      computeCreateFromAgentAssignedAgentIds(
        undefined,
        TASK_STATUS.ASSIGNED,
        creatorId,
      ),
    ).toEqual([creatorId]);
    expect(
      computeCreateFromAgentAssignedAgentIds(
        undefined,
        TASK_STATUS.IN_PROGRESS,
        creatorId,
      ),
    ).toEqual([creatorId]);
  });

  it("returns empty when status does not require assignees and none provided", () => {
    expect(
      computeCreateFromAgentAssignedAgentIds(
        undefined,
        TASK_STATUS.INBOX,
        creatorId,
      ),
    ).toEqual([]);
    expect(
      computeCreateFromAgentAssignedAgentIds(
        undefined,
        TASK_STATUS.BLOCKED,
        creatorId,
      ),
    ).toEqual([]);
  });

  it("uses provided list as-is when non-empty", () => {
    const list = [otherId, creatorId] as Id<"agents">[];
    const result = computeCreateFromAgentAssignedAgentIds(
      list,
      TASK_STATUS.IN_PROGRESS,
      creatorId,
    );
    expect(result).toEqual(list);
  });
});
