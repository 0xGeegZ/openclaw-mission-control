/**
 * Unit tests for task_delete tool: validation (taskId, reason) and Convex action success/failure.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getConvexClient } from "../convex-client";
import { executeTaskDeleteTool } from "./taskDeleteTool";
import type { Id } from "@packages/backend/convex/_generated/dataModel";

const mockAction = vi.fn();
vi.mock("../convex-client", () => ({
  getConvexClient: vi.fn(),
  api: {
    service: {
      actions: {
        deleteTaskFromAgent: "deleteTaskFromAgent",
      },
    },
  },
}));

beforeEach(() => {
  vi.mocked(getConvexClient).mockReturnValue({ action: mockAction } as never);
  mockAction.mockReset();
});

const validParams = {
  agentId: "agent1" as Id<"agents">,
  taskId: "task1",
  reason: "out of scope",
  serviceToken: "token",
  accountId: "acc1" as Id<"accounts">,
};

describe("executeTaskDeleteTool", () => {
  it("returns error when taskId is empty", async () => {
    const result = await executeTaskDeleteTool({
      ...validParams,
      taskId: "   ",
    });
    expect(result).toEqual({ success: false, error: "taskId is required" });
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("returns error when taskId is missing", async () => {
    const result = await executeTaskDeleteTool({
      ...validParams,
      taskId: "",
    });
    expect(result).toEqual({ success: false, error: "taskId is required" });
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("returns error when reason is empty", async () => {
    const result = await executeTaskDeleteTool({
      ...validParams,
      reason: "   ",
    });
    expect(result).toEqual({
      success: false,
      error: "reason is required for archival",
    });
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("returns error when reason is missing", async () => {
    const result = await executeTaskDeleteTool({
      ...validParams,
      reason: "",
    });
    expect(result).toEqual({
      success: false,
      error: "reason is required for archival",
    });
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("returns success when valid taskId and reason provided", async () => {
    mockAction.mockResolvedValue(undefined);
    const result = await executeTaskDeleteTool(validParams);
    expect(result).toEqual({ success: true });
    expect(mockAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        taskId: "task1",
        reason: "out of scope",
        agentId: "agent1",
        serviceToken: "token",
        accountId: "acc1",
      }),
    );
  });

  it("returns success when reason has whitespace (trimmed)", async () => {
    mockAction.mockResolvedValue(undefined);
    const result = await executeTaskDeleteTool({
      ...validParams,
      reason: "  duplicate task  ",
    });
    expect(result).toEqual({ success: true });
    expect(mockAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reason: "duplicate task",
      }),
    );
  });

  it("returns error when Convex action rejects with Error", async () => {
    mockAction.mockRejectedValue(new Error("Orchestrator access denied"));
    const result = await executeTaskDeleteTool(validParams);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Orchestrator access denied");
  });

  it("returns error when Convex action rejects with string", async () => {
    mockAction.mockRejectedValue("Service unavailable");
    const result = await executeTaskDeleteTool(validParams);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Service unavailable");
  });

  it("trims taskId before validation", async () => {
    mockAction.mockResolvedValue(undefined);
    const result = await executeTaskDeleteTool({
      ...validParams,
      taskId: "  task123  ",
    });
    expect(result).toEqual({ success: true });
    expect(mockAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        taskId: "task123",
      }),
    );
  });
});
