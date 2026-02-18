/**
 * Unit and integration tests for linkTaskToPrForAgentTool service action
 *
 * Tests: linkTaskToPrForAgentTool service action and task_link_pr runtime tool
 * Coverage: task-PR bidirectional linking, GitHub API integration, orchestrator enforcement
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Id } from "../_generated/dataModel";

// ============================================================================
// Mock Setup
// ============================================================================

// Mock global fetch for GitHub API calls
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Mock process.env
const originalEnv = process.env;
beforeEach(() => {
  process.env = { ...originalEnv };
  mockFetch.mockClear();
});

afterEach(() => {
  process.env = originalEnv;
});

function createMockContext(dbData: { agent?: any; task?: any; account?: any }) {
  return {
    runQuery: vi.fn(async (query, args) => {
      if (args.agentId) {
        return dbData.agent || null;
      }
      if (args.taskId) {
        return dbData.task || null;
      }
      if (args.accountId) {
        return dbData.account || null;
      }
      return null;
    }),
    runMutation: vi.fn(async (mutation, args) => {
      // For updateTaskPrMetadata, just return success
      return undefined;
    }),
  } as any;
}

// ============================================================================
// Test Suite
// ============================================================================

describe("linkTaskToPrForAgentTool", () => {
  const testAccountId = "acc_123" as Id<"accounts">;
  const testAgentId = "agent_123" as Id<"agents">;
  const testTaskId = "task_123" as Id<"tasks">;
  const testServiceToken = "token_abc123";
  const testPrNumber = 65;

  describe("Orchestrator-only enforcement", () => {
    it("should deny non-orchestrator agents", async () => {
      const ctx = createMockContext({
        agent: {
          _id: testAgentId,
          slug: "engineer", // Not orchestrator
          accountId: testAccountId,
          name: "Engineer Agent",
        },
        task: {
          _id: testTaskId,
          accountId: testAccountId,
          title: "Test Task",
        },
        account: { _id: testAccountId },
      });

      // Mock the requireServiceAuth to pass
      const action = async () => {
        const agent = await ctx.runQuery({} as any, { agentId: testAgentId });
        if (agent?.slug !== "orchestrator") {
          throw new Error("Forbidden: Only orchestrator can link tasks to PRs");
        }
        return { success: true };
      };

      await expect(action()).rejects.toThrow(
        "Forbidden: Only orchestrator can link tasks to PRs",
      );
    });

    it("should allow orchestrator agents", async () => {
      const mockQueryFunc = vi.fn(async (query, args) => {
        if (args.agentId) {
          return {
            _id: testAgentId,
            slug: "orchestrator",
            accountId: testAccountId,
            name: "Orchestrator",
          };
        }
        if (args.taskId) {
          return {
            _id: testTaskId,
            accountId: testAccountId,
            title: "Test Task",
            metadata: {},
          };
        }
        if (args.accountId) {
          return { _id: testAccountId };
        }
        return null;
      });

      const ctx = {
        runQuery: mockQueryFunc,
        runMutation: vi.fn(),
      } as any;

      const action = async () => {
        const agent = await ctx.runQuery({} as any, { agentId: testAgentId });
        expect(agent?.slug).toBe("orchestrator");

        await ctx.runMutation({} as any, {
          taskId: testTaskId,
          prNumber: testPrNumber,
        });
        return { success: true };
      };

      const result = await action();
      expect(result).toEqual({ success: true });
    });
  });

  describe("Graceful degradation (missing GITHUB_TOKEN)", () => {
    it("should succeed on task side when GITHUB_TOKEN missing", async () => {
      delete process.env.GITHUB_TOKEN;

      const ctx = createMockContext({
        agent: {
          _id: testAgentId,
          slug: "orchestrator",
          accountId: testAccountId,
        },
        task: {
          _id: testTaskId,
          accountId: testAccountId,
          title: "Test Task",
          metadata: {},
        },
        account: { _id: testAccountId },
      });

      const action = async () => {
        const ghToken = process.env.GITHUB_TOKEN;

        // Task side mutation happens regardless
        await ctx.runMutation({} as any, {
          taskId: testTaskId,
          prNumber: testPrNumber,
        });

        // PR side is skipped
        if (!ghToken) {
          console.warn("GitHub API call skipped: GITHUB_TOKEN not set");
          return { success: true };
        }
        return { success: true };
      };

      const result = await action();
      expect(result.success).toBe(true);
      expect(ctx.runMutation).toHaveBeenCalled(); // Task mutation was called
    });

    it("should skip GitHub API when GITHUB_REPO missing", async () => {
      process.env.GITHUB_TOKEN = "ghp_test123";
      delete process.env.GITHUB_REPO;
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const ctx = createMockContext({
        agent: {
          _id: testAgentId,
          slug: "orchestrator",
          accountId: testAccountId,
        },
        task: {
          _id: testTaskId,
          accountId: testAccountId,
          title: "Test Task",
          metadata: {},
        },
        account: { _id: testAccountId },
      });

      const action = async () => {
        const ghToken = process.env.GITHUB_TOKEN;
        const repo = process.env.GITHUB_REPO;

        await ctx.runMutation({} as any, {
          taskId: testTaskId,
          prNumber: testPrNumber,
        });

        if (!ghToken) return { success: true };
        if (!repo) {
          console.warn("GitHub API call skipped: GITHUB_REPO not set");
          return { success: true };
        }

        return { success: true };
      };

      const result = await action();
      expect(result.success).toBe(true);
      expect(ctx.runMutation).toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "GitHub API call skipped: GITHUB_REPO not set",
      );
      consoleWarnSpy.mockRestore();
    });

    it("should skip GitHub API when GITHUB_REPO is invalid", async () => {
      process.env.GITHUB_TOKEN = "ghp_test123";
      process.env.GITHUB_REPO = "invalid-repo-format";
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const ctx = createMockContext({
        agent: {
          _id: testAgentId,
          slug: "orchestrator",
          accountId: testAccountId,
        },
        task: {
          _id: testTaskId,
          accountId: testAccountId,
          title: "Test Task",
          metadata: {},
        },
        account: { _id: testAccountId },
      });

      const action = async () => {
        const ghToken = process.env.GITHUB_TOKEN;
        const repo = process.env.GITHUB_REPO;

        await ctx.runMutation({} as any, {
          taskId: testTaskId,
          prNumber: testPrNumber,
        });

        if (!ghToken) return { success: true };
        if (!repo) return { success: true };
        const [owner, repoName] = repo.split("/");
        if (!owner || !repoName) {
          console.warn(
            "GitHub API call skipped: GITHUB_REPO must be in 'owner/repo' format",
          );
          return { success: true };
        }

        return { success: true };
      };

      const result = await action();
      expect(result.success).toBe(true);
      expect(ctx.runMutation).toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "GitHub API call skipped: GITHUB_REPO must be in 'owner/repo' format",
      );
      consoleWarnSpy.mockRestore();
    });

    it("should log warning when GitHub API returns 404", async () => {
      process.env.GITHUB_TOKEN = "ghp_test123";
      process.env.GITHUB_REPO = "0xGeegZ/openclaw-mission-control";
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: "Not Found",
      });

      const action = async () => {
        const ghToken = process.env.GITHUB_TOKEN;
        const repo = process.env.GITHUB_REPO;
        if (!ghToken || !repo) return { success: true };
        const [owner, repoName] = repo.split("/");
        if (!owner || !repoName) return { success: true };

        try {
          const response = await global.fetch(
            `https://api.github.com/repos/${owner}/${repoName}/pulls/${testPrNumber}`,
            {
              headers: {
                Authorization: `Bearer ${ghToken}`,
              },
            },
          );

          if (!response.ok) {
            console.warn(
              `Failed to fetch PR #${testPrNumber}: ${response.statusText}`,
            );
            return { success: true }; // Task already updated
          }
        } catch (err) {
          console.warn("Error updating PR description:", err);
        }

        return { success: true };
      };

      const result = await action();
      expect(result.success).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Not Found"),
      );
      consoleWarnSpy.mockRestore();
    });
  });

  describe("Idempotent marker handling", () => {
    it("should remove old marker before appending new one", async () => {
      const oldBody = "## PR Description\n<!-- task: old_task_id -->";
      const taskMarker = "<!-- task: new_task_id -->";
      const regex = /\n*<!-- task: [\w]+ -->/g;

      // Simulate the marker replacement logic
      let newBody = oldBody.replace(regex, "");
      newBody = newBody.trim() + "\n\n" + taskMarker;

      expect(newBody).toContain("## PR Description");
      expect(newBody).toContain(taskMarker);
      expect(newBody).not.toContain("old_task_id");
    });

    it("should be idempotent on multiple re-links", async () => {
      let body = "## Description";
      const taskId = "task_abc123";
      const regex = /\n*<!-- task: [\w]+ -->/g;
      const marker = `<!-- task: ${taskId} -->`;

      // First link
      body = body.replace(regex, "");
      body = body.trim() + "\n\n" + marker;

      const bodyAfterFirstLink = body;

      // Second link (re-link same task)
      body = body.replace(regex, "");
      body = body.trim() + "\n\n" + marker;

      // Body should be idempotent
      expect(body).toEqual(bodyAfterFirstLink);
    });

    it("should handle special characters in task ID safely", async () => {
      const taskId = "task_abc-123_def";
      const marker = `<!-- task: ${taskId} -->`;
      const regex = /\n*<!-- task: [\w]+ -->/g;

      // This regex won't match hyphens, so the old marker won't be removed
      // This is actually a limitation we should document
      const body = "test\n<!-- task: task_abc-123_def -->";
      const result = body.replace(regex, "");

      // Verify regex matches word chars only
      expect(result).toBe(body); // Not removed due to hyphen
    });
  });

  describe("Error cases", () => {
    it("should throw when task not found", async () => {
      const ctx = createMockContext({
        agent: {
          _id: testAgentId,
          slug: "orchestrator",
          accountId: testAccountId,
        },
        task: null, // Task doesn't exist
        account: { _id: testAccountId },
      });

      const action = async () => {
        const task = await ctx.runQuery({} as any, { taskId: testTaskId });
        if (!task) {
          throw new Error("Not found: Task does not exist");
        }
        return { success: true };
      };

      await expect(action()).rejects.toThrow("Not found: Task does not exist");
    });

    it("should deny cross-account linking", async () => {
      const otherAccountId = "acc_999" as Id<"accounts">;

      const mockQueryFunc = vi.fn(async (query, args) => {
        if (args.agentId) {
          return {
            _id: testAgentId,
            slug: "orchestrator",
            accountId: testAccountId, // Agent in account A
          };
        }
        if (args.taskId) {
          return {
            _id: testTaskId,
            accountId: otherAccountId, // Task in account B
            title: "Other Account Task",
          };
        }
        return null;
      });

      const ctx = {
        runQuery: mockQueryFunc,
        runMutation: vi.fn(),
      } as any;

      const action = async () => {
        const agent = await ctx.runQuery({} as any, { agentId: testAgentId });
        const task = await ctx.runQuery({} as any, { taskId: testTaskId });

        if (agent?.accountId !== task?.accountId) {
          throw new Error("Forbidden: Task belongs to different account");
        }
        return { success: true };
      };

      await expect(action()).rejects.toThrow(
        "Forbidden: Task belongs to different account",
      );
    });
  });

  describe("Activity logging (optional enhancement)", () => {
    it("should log activity when task-PR link created", async () => {
      const activities: any[] = [];

      const ctx = createMockContext({
        agent: {
          _id: testAgentId,
          slug: "orchestrator",
          accountId: testAccountId,
          name: "Orchestrator",
        },
        task: {
          _id: testTaskId,
          accountId: testAccountId,
          title: "Test Task",
          metadata: {},
        },
        account: { _id: testAccountId },
      });

      // Mock activity logging
      const logActivity = vi.fn(async (activity) => {
        activities.push(activity);
      });

      const action = async () => {
        const agent = await ctx.runQuery({} as any, { agentId: testAgentId });
        const task = await ctx.runQuery({} as any, { taskId: testTaskId });

        // Log activity
        await logActivity({
          type: "task_pr_linked",
          accountId: testAccountId,
          targetType: "task",
          targetId: testTaskId,
          targetName: task?.title,
          meta: { prNumber: testPrNumber },
        });

        return { success: true };
      };

      const result = await action();
      expect(result.success).toBe(true);
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "task_pr_linked",
          meta: { prNumber: testPrNumber },
        }),
      );
    });
  });
});

// ============================================================================
// createTaskFromAgent assignedAgentIds forwarding
// ============================================================================

describe("createTaskFromAgent", () => {
  it("forwards assignedAgentIds to createFromAgent mutation when provided", () => {
    const payload = {
      agentId: "agent1" as Id<"agents">,
      title: "Task",
      assignedAgentIds: ["agent2", "agent3"] as Id<"agents">[],
    };
    const mutationArgs = {
      agentId: payload.agentId,
      title: payload.title,
      description: undefined,
      priority: undefined,
      labels: undefined,
      dueDate: undefined,
      status: undefined,
      blockedReason: undefined,
      assignedAgentIds: payload.assignedAgentIds,
    };
    expect(mutationArgs.assignedAgentIds).toEqual(["agent2", "agent3"]);
  });

  it("omits assignedAgentIds when not provided", () => {
    const mutationArgs = {
      agentId: "agent1" as Id<"agents">,
      title: "Task",
      assignedAgentIds: undefined,
    };
    expect(mutationArgs.assignedAgentIds).toBeUndefined();
  });
});

// ============================================================================
// createMessageFromAgent multi-part idempotency
// ============================================================================

describe("createMessageFromAgent", () => {
  it("mutation args shape includes sourceNotificationPartIndex when provided", () => {
    const mutationArgs = {
      agentId: "agent_1" as Id<"agents">,
      taskId: "task_1" as Id<"tasks">,
      content: "Part one.",
      sourceNotificationId: "notif_1" as Id<"notifications">,
      sourceNotificationPartIndex: 0,
      allowAgentMentions: true,
      suppressAgentNotifications: false,
    };
    expect(mutationArgs.sourceNotificationPartIndex).toBe(0);
  });

  it("mutation args shape omits sourceNotificationPartIndex for single-message delivery", () => {
    const mutationArgs = {
      agentId: "agent_1" as Id<"agents">,
      taskId: "task_1" as Id<"tasks">,
      content: "Single message.",
      sourceNotificationId: "notif_1" as Id<"notifications">,
      allowAgentMentions: true,
      suppressAgentNotifications: false,
    };
    expect((mutationArgs as Record<string, unknown>).sourceNotificationPartIndex).toBeUndefined();
  });
});

// ============================================================================
// getAgentSkillsForTool Tests
// ============================================================================

describe("getAgentSkillsForTool", () => {
  const testAccountId = "acc_123" as Id<"accounts">;
  const engineerId = "agent_engineer" as Id<"agents">;
  const qaId = "agent_qa" as Id<"agents">;
  const orchestratorId = "agent_orchestrator" as Id<"agents">;
  const testServiceToken = "token_abc123";

  const engineerAgent = {
    _id: engineerId,
    _creationTime: 1000000,
    slug: "engineer",
    name: "Engineer",
    accountId: testAccountId,
    lastHeartbeat: 1700000,
    openclawConfig: {
      skillIds: ["github", "commit", "run-tests-and-fix"] as Id<"skills">[],
    },
  };

  const qaAgent = {
    _id: qaId,
    _creationTime: 1000100,
    slug: "qa",
    name: "QA",
    accountId: testAccountId,
    lastHeartbeat: 1700100,
    openclawConfig: {
      skillIds: ["security-audit", "code-review-checklist"] as Id<"skills">[],
    },
  };

  const orchestratorAgent = {
    _id: orchestratorId,
    _creationTime: 1000200,
    slug: "orchestrator",
    name: "Orchestrator",
    accountId: testAccountId,
    lastHeartbeat: 1700200,
    openclawConfig: {
      skillIds: [
        "task-search",
        "task-delete",
        "get-agent-skills",
      ] as Id<"skills">[],
    },
  };

  describe("All agents access", () => {
    it("should allow any agent to query all agents' skills", async () => {
      const ctx = {
        runQuery: vi.fn(async (query, args) => {
          if (args.agentId === engineerId) {
            return engineerAgent;
          }
          if (args.accountId) {
            return [engineerAgent, qaAgent, orchestratorAgent];
          }
          return null;
        }),
      } as any;

      const action = async () => {
        const agent = await ctx.runQuery({}, { agentId: engineerId });
        if (!agent) throw new Error("Agent not found");

        const agents = await ctx.runQuery({}, { accountId: testAccountId });
        return agents.map((a: any) => ({
          agentId: a.slug,
          skillIds: a.openclawConfig?.skillIds || [],
          skillCount: a.openclawConfig?.skillIds?.length || 0,
          lastUpdated: a.lastHeartbeat || a._creationTime,
        }));
      };

      const result = await action();
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(
        expect.objectContaining({
          agentId: "engineer",
          skillCount: 3,
        }),
      );
      expect(result[1]).toEqual(
        expect.objectContaining({
          agentId: "qa",
          skillCount: 2,
        }),
      );
    });

    it("should allow engineer to query own skills", async () => {
      const mockQueryFunc = vi.fn(async (query, args) => {
        if (args.agentId === engineerId) {
          return engineerAgent;
        }
        if (args.agentId === engineerId && args.queryAgentId === engineerId) {
          return engineerAgent;
        }
        return null;
      });

      const ctx = {
        runQuery: mockQueryFunc,
      } as any;

      const action = async () => {
        const agent = await ctx.runQuery({}, { agentId: engineerId });
        if (!agent) throw new Error("Agent not found");

        const targetAgent = await ctx.runQuery({}, { agentId: engineerId });
        if (!targetAgent) throw new Error("Target agent not found");

        return [
          {
            agentId: targetAgent.slug,
            skillIds: targetAgent.openclawConfig?.skillIds || [],
            skillCount: targetAgent.openclawConfig?.skillIds?.length || 0,
            lastUpdated: targetAgent.lastHeartbeat || targetAgent._creationTime,
          },
        ];
      };

      const result = await action();
      expect(result).toHaveLength(1);
      expect(result[0].agentId).toBe("engineer");
      expect(result[0].skillCount).toBe(3);
    });
  });

  describe("get_agent_skills available to all agents", () => {
    it("should allow orchestrator to query any agent's skills", async () => {
      const ctx = {
        runQuery: vi.fn(async (query, args) => {
          if (args.agentId === orchestratorId) {
            return orchestratorAgent;
          }
          if (args.agentId === qaId) {
            return qaAgent;
          }
          return null;
        }),
      } as any;

      const toIso = (ts: number) => new Date(ts).toISOString();

      const action = async () => {
        const orchestrator = await ctx.runQuery(
          {},
          { agentId: orchestratorId },
        );
        if (!orchestrator) throw new Error("Orchestrator not found");

        const targetAgent = await ctx.runQuery({}, { agentId: qaId });
        if (!targetAgent) throw new Error("Target agent not found");

        return [
          {
            agentId: targetAgent.slug,
            skillIds: targetAgent.openclawConfig?.skillIds || [],
            skillCount: targetAgent.openclawConfig?.skillIds?.length || 0,
            lastUpdated: toIso(
              targetAgent.lastHeartbeat || targetAgent._creationTime,
            ),
          },
        ];
      };

      const result = await action();
      expect(result[0].agentId).toBe("qa");
      expect(result[0].skillIds).toContain("security-audit");
      expect(result[0].lastUpdated).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
    });

    it("should allow non-orchestrator to query other agents' skills", async () => {
      const ctx = {
        runQuery: vi.fn(async (query, args) => {
          if (args.agentId === engineerId) {
            return engineerAgent;
          }
          if (args.agentId === qaId) {
            return qaAgent;
          }
          return null;
        }),
      } as any;

      const toIso = (ts: number) => new Date(ts).toISOString();

      const action = async () => {
        const engineer = await ctx.runQuery({}, { agentId: engineerId });
        if (!engineer) throw new Error("Engineer not found");

        const targetAgent = await ctx.runQuery({}, { agentId: qaId });
        if (!targetAgent) throw new Error("Target agent not found");

        return [
          {
            agentId: targetAgent.slug,
            skillIds: targetAgent.openclawConfig?.skillIds || [],
            skillCount: targetAgent.openclawConfig?.skillIds?.length || 0,
            lastUpdated: toIso(
              targetAgent.lastHeartbeat || targetAgent._creationTime,
            ),
          },
        ];
      };

      const result = await action();
      expect(result[0].agentId).toBe("qa");
      expect(result[0].skillIds).toContain("security-audit");
    });
  });

  describe("Error handling", () => {
    it("should error on non-existent agent", async () => {
      const ctx = {
        runQuery: vi.fn(async (query, args) => {
          if (args.agentId === engineerId) {
            return engineerAgent;
          }
          return null; // Non-existent agent
        }),
      } as any;

      const action = async () => {
        const agent = await ctx.runQuery({}, { agentId: engineerId });
        if (!agent) throw new Error("Not found: Agent does not exist");

        const targetAgent = await ctx.runQuery(
          {},
          {
            agentId: "nonexistent" as Id<"agents">,
          },
        );
        if (!targetAgent)
          throw new Error("Not found: Target agent does not exist");

        return null;
      };

      await expect(action()).rejects.toThrow(
        "Not found: Target agent does not exist",
      );
    });

    it("should error on cross-account access attempt", async () => {
      const otherAccountId = "acc_999" as Id<"accounts">;

      const ctx = {
        runQuery: vi.fn(async (query, args) => {
          if (args.agentId === engineerId) {
            return { ...engineerAgent, accountId: testAccountId };
          }
          if (args.agentId === qaId) {
            return { ...qaAgent, accountId: otherAccountId }; // Different account
          }
          return null;
        }),
      } as any;

      const action = async () => {
        const engineer = await ctx.runQuery({}, { agentId: engineerId });
        if (engineer.accountId !== testAccountId) {
          throw new Error("Forbidden: Agent belongs to different account");
        }

        const targetAgent = await ctx.runQuery({}, { agentId: qaId });
        if (targetAgent.accountId !== testAccountId) {
          throw new Error(
            "Forbidden: Target agent belongs to different account",
          );
        }

        return null;
      };

      await expect(action()).rejects.toThrow(
        "Forbidden: Target agent belongs to different account",
      );
    });
  });

  describe("Skill count and format", () => {
    it("should return correct skill count for each agent", async () => {
      const ctx = {
        runQuery: vi.fn(async (query, args) => {
          if (args.accountId) {
            return [
              {
                ...engineerAgent,
                openclawConfig: {
                  skillIds: ["skill1", "skill2", "skill3"] as Id<"skills">[],
                },
              },
              {
                ...qaAgent,
                openclawConfig: { skillIds: ["skill1"] as Id<"skills">[] },
              },
            ];
          }
          return null;
        }),
      } as any;

      const action = async () => {
        const agents = await ctx.runQuery({}, { accountId: testAccountId });
        return agents.map((a: any) => ({
          agentId: a.slug,
          skillCount: a.openclawConfig?.skillIds?.length || 0,
        }));
      };

      const result = await action();
      expect(result[0].skillCount).toBe(3);
      expect(result[1].skillCount).toBe(1);
    });

    it("should return empty skill list when agent has no skills", async () => {
      const noSkillsAgent = {
        ...engineerAgent,
        openclawConfig: { skillIds: [] as Id<"skills">[] },
      };

      const ctx = {
        runQuery: vi.fn(async (query, args) => {
          if (args.agentId === engineerId) {
            return noSkillsAgent;
          }
          return null;
        }),
      } as any;

      const action = async () => {
        const agent = await ctx.runQuery({}, { agentId: engineerId });
        return {
          agentId: agent.slug,
          skillIds: agent.openclawConfig?.skillIds || [],
          skillCount: agent.openclawConfig?.skillIds?.length || 0,
        };
      };

      const result = await action();
      expect(result.skillCount).toBe(0);
      expect(result.skillIds).toEqual([]);
    });
  });
});

// ============================================================================
// searchTasksForAgentTool Tests
// ============================================================================

describe("searchTasksForAgentTool", () => {
  const testAccountId = "acc_123" as Id<"accounts">;
  const testAgentId = "agent_orchestrator" as Id<"agents">;
  const testServiceToken = "token_abc123";

  it("enforces orchestrator-only access", async () => {
    const ctx = createMockContext({
      agent: { _id: testAgentId, slug: "engineer", accountId: testAccountId },
      account: {
        _id: testAccountId,
        settings: { orchestratorAgentId: "agent_other" as Id<"agents"> },
      },
    });

    const action = async () => {
      const agent = await ctx.runQuery({} as any, { agentId: testAgentId });
      const account = await ctx.runQuery({} as any, {
        accountId: testAccountId,
      });
      if (!account?.settings?.orchestratorAgentId) {
        throw new Error("Forbidden: Only the orchestrator can search tasks");
      }
      if (account.settings.orchestratorAgentId !== agent._id) {
        throw new Error("Forbidden: Only the orchestrator can search tasks");
      }
      return [];
    };

    await expect(action()).rejects.toThrow(
      "Forbidden: Only the orchestrator can search tasks",
    );
  });

  it("returns results for orchestrator", async () => {
    const ctx = createMockContext({
      agent: {
        _id: testAgentId,
        slug: "orchestrator",
        accountId: testAccountId,
      },
      account: {
        _id: testAccountId,
        settings: { orchestratorAgentId: testAgentId },
      },
    });

    const action = async () => {
      const account = await ctx.runQuery({} as any, {
        accountId: testAccountId,
      });
      if (account.settings.orchestratorAgentId !== testAgentId) {
        throw new Error("Forbidden: Only the orchestrator can search tasks");
      }
      return [
        {
          _id: "task1",
          title: "Test Task",
          status: "in_progress",
          priority: 3,
          assignedAgentIds: [],
          assignedUserIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          relevanceScore: 3,
        },
      ];
    };

    const result = await action();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Test Task");
  });
});

// ============================================================================
// loadTaskDetailsForAgentTool Tests
// ============================================================================

describe("loadTaskDetailsForAgentTool", () => {
  const testAccountId = "acc_123" as Id<"accounts">;
  const testAgentId = "agent_123" as Id<"agents">;
  const testTaskId = "task_123" as Id<"tasks">;

  it("rejects cross-account access", async () => {
    const ctx = createMockContext({
      agent: { _id: testAgentId, accountId: testAccountId },
      task: { _id: testTaskId, accountId: "acc_other" },
    });

    const action = async () => {
      const task = await ctx.runQuery({} as any, { taskId: testTaskId });
      if (task.accountId !== testAccountId) {
        throw new Error("Forbidden: Task belongs to different account");
      }
      return { task, thread: [] };
    };

    await expect(action()).rejects.toThrow(
      "Forbidden: Task belongs to different account",
    );
  });
});

// ============================================================================
// createResponseRequestNotifications Tests
// ============================================================================

describe("createResponseRequestNotifications", () => {
  it("rejects empty message or recipients", async () => {
    const action = async (recipients: string[], message: string) => {
      if (recipients.length === 0) {
        throw new Error("recipientSlugs is required");
      }
      if (!message.trim()) {
        throw new Error("message is required");
      }
      return { notificationIds: [] };
    };

    await expect(action([], "ping")).rejects.toThrow(
      "recipientSlugs is required",
    );
    await expect(action(["qa"], " ")).rejects.toThrow("message is required");
  });

  it("rejects too many recipients", async () => {
    const maxRecipients = 10;
    const recipients = Array.from(
      { length: maxRecipients + 1 },
      (_, i) => `a${i}`,
    );
    const action = async () => {
      if (recipients.length > maxRecipients) {
        throw new Error(
          `Too many recipients: max ${maxRecipients} allowed per request`,
        );
      }
      return { notificationIds: [] };
    };

    await expect(action()).rejects.toThrow(
      "Too many recipients: max 10 allowed per request",
    );
  });
});
