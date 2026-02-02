import { mutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import { Id } from "./_generated/dataModel";

const DEMO_SLUG = "demo";
const DEMO_NAME = "Demo";

/** Minimal OpenClaw config for seed agents (matches schema). */
function defaultOpenclawConfig() {
  return {
    model: "claude-sonnet-4-20250514",
    temperature: 0.7,
    maxTokens: 4096,
    skillIds: [] as Id<"skills">[],
    contextConfig: {
      maxHistoryMessages: 50,
      includeTaskContext: true,
      includeTeamContext: true,
    },
    behaviorFlags: {
      canCreateTasks: false,
      canModifyTaskStatus: true,
      canCreateDocuments: true,
      canMentionAgents: true,
    },
  };
}

/**
 * Idempotent seed: creates demo account (if missing), 2 agents, 5 tasks, 2–3 messages.
 * Call from Convex dashboard (Run function) while signed in; the current user becomes the demo account owner.
 * Safe to run multiple times: skips creation when demo data already exists.
 */
export const run = mutation({
  args: {},
  handler: async (ctx) => {
    const auth = await requireAuth(ctx);

    let account = await ctx.db
      .query("accounts")
      .withIndex("by_slug", (q) => q.eq("slug", DEMO_SLUG))
      .unique();

    if (!account) {
      const accountId = await ctx.db.insert("accounts", {
        name: DEMO_NAME,
        slug: DEMO_SLUG,
        plan: "free",
        runtimeStatus: "offline",
        createdAt: Date.now(),
      });
      await ctx.db.insert("memberships", {
        accountId,
        userId: auth.userId,
        userName: auth.userName,
        userEmail: auth.userEmail,
        userAvatarUrl: auth.userAvatarUrl,
        role: "owner",
        joinedAt: Date.now(),
      });
      account = await ctx.db.get(accountId);
      if (!account) throw new Error("Failed to create account");
    }

    const accountId = account._id;

    const existingAgents = await ctx.db
      .query("agents")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect();

    let agentIds: Id<"agents">[] = [];
    if (existingAgents.length === 0) {
      const now = Date.now();
      const a1 = await ctx.db.insert("agents", {
        accountId,
        name: "Jarvis",
        slug: "jarvis",
        role: "Squad Lead",
        description: "Coordinates tasks and keeps the team unblocked.",
        sessionKey: `agent:jarvis:${accountId}`,
        status: "offline",
        heartbeatInterval: 15,
        openclawConfig: defaultOpenclawConfig(),
        createdAt: now,
      });
      const a2 = await ctx.db.insert("agents", {
        accountId,
        name: "Vision",
        slug: "vision",
        role: "SEO Analyst",
        description: "Handles content and SEO deliverables.",
        sessionKey: `agent:vision:${accountId}`,
        status: "offline",
        heartbeatInterval: 15,
        openclawConfig: defaultOpenclawConfig(),
        createdAt: now,
      });
      agentIds = [a1, a2];
    } else {
      agentIds = existingAgents.map((a) => a._id);
    }

    const existingTasks = await ctx.db
      .query("tasks")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect();

    let taskIds: Id<"tasks">[] = [];
    if (existingTasks.length === 0) {
      const now = Date.now();
      const statuses = ["inbox", "assigned", "in_progress", "review", "done"] as const;
      const titles = [
        "Set up project repo",
        "Write API spec",
        "Implement auth flow",
        "Review PR #42",
        "Ship v1.0",
      ];
      for (let i = 0; i < 5; i++) {
        const taskId = await ctx.db.insert("tasks", {
          accountId,
          title: titles[i],
          description: `Demo task ${i + 1}.`,
          status: statuses[i],
          priority: 3,
          assignedUserIds: [],
          assignedAgentIds: i >= 1 && agentIds[0] ? [agentIds[0]] : [],
          labels: [],
          createdBy: auth.userId,
          createdAt: now,
          updatedAt: now,
        });
        taskIds.push(taskId);
      }
    } else {
      taskIds = existingTasks.map((t) => t._id);
    }

    const existingMessages = await ctx.db
      .query("messages")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect();

    if (existingMessages.length === 0 && taskIds.length >= 2) {
      const now = Date.now();
      await ctx.db.insert("messages", {
        accountId,
        taskId: taskIds[0],
        authorType: "user",
        authorId: auth.userId,
        content: "Kicking off this task.",
        mentions: [],
        createdAt: now,
      });
      await ctx.db.insert("messages", {
        accountId,
        taskId: taskIds[0],
        authorType: "user",
        authorId: auth.userId,
        content: "Update: repo is ready.",
        mentions: [],
        createdAt: now,
      });
      await ctx.db.insert("messages", {
        accountId,
        taskId: taskIds[1],
        authorType: "user",
        authorId: auth.userId,
        content: "Assigning to the squad lead.",
        mentions: [],
        createdAt: now,
      });
    }

    return {
      accountId,
      slug: DEMO_SLUG,
      agentsCreated: existingAgents.length === 0 ? 2 : 0,
      tasksCreated: existingTasks.length === 0 ? 5 : 0,
      messagesCreated: existingMessages.length === 0 && taskIds.length >= 2 ? 3 : 0,
    };
  },
});
