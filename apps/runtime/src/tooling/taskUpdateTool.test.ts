/**
 * Unit tests for task_update tool execution and validation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getConvexClient } from "../convex-client";
import { executeTaskUpdateTool } from "./taskUpdateTool";
import type { Id } from "@packages/backend/convex/_generated/dataModel";

vi.mock("../convex-client", () => ({
  getConvexClient: vi.fn(),
  api: {
    service: {
      actions: {
        updateTaskFromAgent: "updateTaskFromAgent",
      },
    },
  },
}));

const mockAction = vi.fn();

describe("taskUpdateTool", () => {
  beforeEach(() => {
    mockAction.mockClear();
    vi.mocked(getConvexClient).mockReturnValue({
      action: mockAction,
    } as never);
  });

  describe("executeTaskUpdateTool", () => {
    const baseParams = {
      agentId: "agent123" as Id<"agents">,
      accountId: "account123" as Id<"accounts">,
      serviceToken: "token123",
      taskId: "task123",
    };

    it("returns error when taskId is empty", async () => {
      const result = await executeTaskUpdateTool({
        ...baseParams,
        taskId: "",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("taskId is required");
    });

    it("returns error when no fields are provided", async () => {
      const result = await executeTaskUpdateTool({
        ...baseParams,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("At least one field");
    });

    it("returns error when priority is out of range", async () => {
      const result = await executeTaskUpdateTool({
        ...baseParams,
        priority: 6,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("priority must be between 1 (highest) and 5 (lowest)");
    });

    it("returns error when status is invalid", async () => {
      const result = await executeTaskUpdateTool({
        ...baseParams,
        status: "invalid_status",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid status");
    });

    it("returns error when status is blocked without blockedReason", async () => {
      const result = await executeTaskUpdateTool({
        ...baseParams,
        status: "blocked",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("blockedReason is required");
    });

    it("succeeds when updating title only", async () => {
      mockAction.mockResolvedValue({
        taskId: baseParams.taskId,
        changedFields: ["title"],
      });

      const result = await executeTaskUpdateTool({
        ...baseParams,
        title: "New Title",
      });

      expect(result.success).toBe(true);
      expect(result.taskId).toBe(baseParams.taskId);
      expect(mockAction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          title: "New Title",
        })
      );
    });

    it("succeeds when updating multiple fields", async () => {
      mockAction.mockResolvedValue({
        taskId: baseParams.taskId,
        changedFields: ["title", "priority", "labels"],
      });

      const result = await executeTaskUpdateTool({
        ...baseParams,
        title: "New Title",
        priority: 2,
        labels: ["urgent", "bug"],
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("Modified: title, priority, labels");
    });

    it("succeeds when updating status with valid blockedReason", async () => {
      mockAction.mockResolvedValue({
        taskId: baseParams.taskId,
        changedFields: ["status"],
      });

      const result = await executeTaskUpdateTool({
        ...baseParams,
        status: "blocked",
        blockedReason: "Waiting on design approval",
      });

      expect(result.success).toBe(true);
      expect(mockAction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: "blocked",
          blockedReason: "Waiting on design approval",
        })
      );
    });

    it("handles Convex action errors gracefully", async () => {
      mockAction.mockRejectedValue(new Error("Convex connection failed"));

      const result = await executeTaskUpdateTool({
        ...baseParams,
        title: "New Title",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Convex connection failed");
    });

    it("trims whitespace from string fields", async () => {
      mockAction.mockResolvedValue({
        taskId: baseParams.taskId,
        changedFields: ["title", "description"],
      });

      await executeTaskUpdateTool({
        ...baseParams,
        title: "  New Title  ",
        description: "  New description  ",
      });

      expect(mockAction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          title: "New Title",
          description: "New description",
        })
      );
    });

    it("accepts valid status transitions", async () => {
      mockAction.mockResolvedValue({
        taskId: baseParams.taskId,
        changedFields: ["status"],
      });

      for (const status of [
        "in_progress",
        "review",
        "done",
        "blocked",
      ]) {
        mockAction.mockClear();
        const result = await executeTaskUpdateTool({
          ...baseParams,
          status,
          blockedReason: status === "blocked" ? "reason" : undefined,
        });
        expect(result.success).toBe(true);
      }
    });

    it("preserves assignee arrays", async () => {
      mockAction.mockResolvedValue({
        taskId: baseParams.taskId,
        changedFields: ["assignedAgentIds"],
      });

      const agentIds = ["agent1", "agent2"];
      await executeTaskUpdateTool({
        ...baseParams,
        assignedAgentIds: agentIds,
      });

      expect(mockAction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          assignedAgentIds: agentIds,
        })
      );
    });

    it("handles dueDate as optional unix timestamp", async () => {
      mockAction.mockResolvedValue({
        taskId: baseParams.taskId,
        changedFields: ["dueDate"],
      });

      const futureDate = Date.now() + 86400000; // +1 day
      const result = await executeTaskUpdateTool({
        ...baseParams,
        dueDate: futureDate,
      });

      expect(result.success).toBe(true);
      expect(mockAction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          dueDate: futureDate,
        })
      );
    });
  });
});
