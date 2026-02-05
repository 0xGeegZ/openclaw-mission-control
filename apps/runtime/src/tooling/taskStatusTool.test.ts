/**
 * Unit tests for task_status tool: validation (taskId, status, blockedReason) and Convex action success/failure.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getConvexClient } from "../convex-client";
import { executeTaskStatusTool } from "./taskStatusTool";
import type { Id } from "@packages/backend/convex/_generated/dataModel";

const mockAction = vi.fn();
vi.mock("../convex-client", () => ({
  getConvexClient: vi.fn(),
  api: {
    service: {
      actions: {
        updateTaskStatusFromAgent: "updateTaskStatusFromAgent",
      },
    },
  },
}));

beforeEach(() => {
  vi.mocked(getConvexClient).mockReturnValue({ action: mockAction } as never);
});

const validParams = {
  agentId: "agent1" as Id<"agents">,
  taskId: "task1",
  status: "in_progress" as const,
  serviceToken: "token",
  accountId: "acc1" as Id<"accounts">,
};

describe("executeTaskStatusTool", () => {
  it("returns error when taskId is empty", async () => {
    const result = await executeTaskStatusTool({
      ...validParams,
      taskId: "   ",
    });
    expect(result).toEqual({ success: false, error: "taskId is required" });
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("returns error when status is invalid", async () => {
    const result = await executeTaskStatusTool({
      ...validParams,
      status: "inbox",
    });
    expect(result).toEqual({
      success: false,
      error:
        "Invalid status: must be one of in_progress, review, done, blocked",
    });
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("returns error when status is blocked and blockedReason is missing", async () => {
    const result = await executeTaskStatusTool({
      ...validParams,
      status: "blocked",
    });
    expect(result).toEqual({
      success: false,
      error: "blockedReason is required when status is blocked",
    });
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("returns error when status is blocked and blockedReason is whitespace", async () => {
    const result = await executeTaskStatusTool({
      ...validParams,
      status: "blocked",
      blockedReason: "  ",
    });
    expect(result).toEqual({
      success: false,
      error: "blockedReason is required when status is blocked",
    });
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("returns success when valid and Convex action resolves", async () => {
    mockAction.mockResolvedValue(undefined);
    const result = await executeTaskStatusTool({
      ...validParams,
      status: "done",
    });
    expect(result).toEqual({ success: true });
    expect(mockAction).toHaveBeenCalled();
  });

  it("returns error when Convex action rejects", async () => {
    mockAction.mockRejectedValue(new Error("Network error"));
    const result = await executeTaskStatusTool(validParams);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Network error");
  });
});
