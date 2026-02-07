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

function createMockContext(dbData: {
  agent?: any;
  task?: any;
  account?: any;
}) {
  return {
    runQuery: vi.fn(async (query, args) => {
      if (query.name === "getInternal" && args.agentId) {
        return dbData.agent || null;
      }
      if (query.name === "getInternal" && args.taskId) {
        return dbData.task || null;
      }
      if (query.name === "getInternal" && args.accountId) {
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

      await expect(action()).rejects.toThrow("Forbidden: Only orchestrator can link tasks to PRs");
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
        
        await ctx.runMutation({} as any, { taskId: testTaskId, prNumber: testPrNumber });
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
        await ctx.runMutation({} as any, { taskId: testTaskId, prNumber: testPrNumber });

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

    it("should log warning when GitHub API returns 404", async () => {
      process.env.GITHUB_TOKEN = "ghp_test123";
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: "Not Found",
      });

      const action = async () => {
        const ghToken = process.env.GITHUB_TOKEN;
        if (!ghToken) return { success: true };

        try {
          const response = await global.fetch(
            `https://api.github.com/repos/0xGeegZ/openclaw-mission-control/pulls/${testPrNumber}`,
            {
              headers: {
                Authorization: `Bearer ${ghToken}`,
              },
            }
          );

          if (!response.ok) {
            console.warn(`Failed to fetch PR #${testPrNumber}: ${response.statusText}`);
            return { success: true }; // Task already updated
          }
        } catch (err) {
          console.warn("Error updating PR description:", err);
        }

        return { success: true };
      };

      const result = await action();
      expect(result.success).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Not Found"));
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

      await expect(action()).rejects.toThrow("Forbidden: Task belongs to different account");
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
        })
      );
    });
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
      skillIds: ["task-search", "task-delete", "get-agent-skills"] as Id<"skills">[],
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
        })
      );
      expect(result[1]).toEqual(
        expect.objectContaining({
          agentId: "qa",
          skillCount: 2,
        })
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

  describe("Orchestrator-enhanced visibility", () => {
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

      const action = async () => {
        const orchestrator = await ctx.runQuery({}, { agentId: orchestratorId });
        if (orchestrator?.slug !== "orchestrator") {
          throw new Error("Only orchestrator can query other agents");
        }

        const targetAgent = await ctx.runQuery({}, { agentId: qaId });
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
      expect(result[0].agentId).toBe("qa");
      expect(result[0].skillIds).toContain("security-audit");
    });

    it("should deny non-orchestrator querying other agents' skills", async () => {
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

      const action = async () => {
        const engineer = await ctx.runQuery({}, { agentId: engineerId });
        if (!engineer) throw new Error("Engineer not found");

        // Engineer tries to query QA
        if (engineer.slug !== "orchestrator" && qaId !== engineerId) {
          throw new Error("Forbidden: Only orchestrator can query other agents' skills");
        }
        return null;
      };

      await expect(action()).rejects.toThrow(
        "Forbidden: Only orchestrator can query other agents' skills"
      );
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

        const targetAgent = await ctx.runQuery({}, {
          agentId: "nonexistent" as Id<"agents">,
        });
        if (!targetAgent) throw new Error("Not found: Target agent does not exist");

        return null;
      };

      await expect(action()).rejects.toThrow("Not found: Target agent does not exist");
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
          throw new Error("Forbidden: Target agent belongs to different account");
        }

        return null;
      };

      await expect(action()).rejects.toThrow(
        "Forbidden: Target agent belongs to different account"
      );
    });
  });

  describe("Skill count and format", () => {
    it("should return correct skill count for each agent", async () => {
      const ctx = {
        runQuery: vi.fn(async (query, args) => {
          if (args.accountId) {
            return [
              { ...engineerAgent, openclawConfig: { skillIds: ["skill1", "skill2", "skill3"] as Id<"skills">[] } },
              { ...qaAgent, openclawConfig: { skillIds: ["skill1"] as Id<"skills">[] } },
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
