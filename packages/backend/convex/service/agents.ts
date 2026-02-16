import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { agentStatusValidator } from "../lib/validators";
import { logActivity } from "../lib/activity";
import { generateDefaultSoul } from "../lib/agent_soul";
import {
  buildDefaultUserContent,
  buildDefaultIdentityContent,
} from "../lib/user_identity_fallback";

/**
 * Service-only agent functions.
 * These are called by the runtime service, not users.
 *
 * NOTE: In production, these should validate service auth token.
 * For now, they're internal mutations that can be called by actions.
 */

/**
 * Update agent heartbeat.
 * Called by runtime when agent completes heartbeat cycle.
 */
export const upsertHeartbeat = internalMutation({
  args: {
    agentId: v.id("agents"),
    status: agentStatusValidator,
    currentTaskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }

    const oldStatus = agent.status;
    const now = Date.now();

    await ctx.db.patch(args.agentId, {
      status: args.status,
      currentTaskId: args.currentTaskId,
      lastHeartbeat: now,
    });

    // Log activity if status changed
    if (oldStatus !== args.status) {
      await logActivity({
        ctx,
        accountId: agent.accountId,
        type: "agent_status_changed",
        actorType: "agent",
        actorId: args.agentId,
        actorName: agent.name,
        targetType: "agent",
        targetId: args.agentId,
        targetName: agent.name,
        meta: { oldStatus, newStatus: args.status, heartbeat: true },
      });
    }

    return { success: true, timestamp: now };
  },
});

/**
 * Mark all agents for an account as offline.
 * Called when runtime shuts down.
 */
export const markAllOffline = internalMutation({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    for (const agent of agents) {
      if (agent.status !== "offline") {
        await ctx.db.patch(agent._id, {
          status: "offline",
          currentTaskId: undefined,
        });
      }
    }

    return { success: true, count: agents.length };
  },
});

/**
 * Get an agent by ID (internal, no user auth required).
 */
export const getInternal = internalQuery({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.agentId);
  },
});

/**
 * List agents for an account (internal, no user auth required).
 */
export const listInternal = internalQuery({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
  },
});

/**
 * List agents for runtime profile sync.
 * Returns effectiveSoulContent, effectiveUserMd, effectiveIdentityContent, openclawConfig, and resolvedSkills.
 */
export const listForRuntime = internalQuery({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    const effectiveUserMd =
      (account?.settings as { userMd?: string } | undefined)?.userMd?.trim() ||
      buildDefaultUserContent();

    const agents = await ctx.db
      .query("agents")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    return await Promise.all(
      agents.map(async (agent) => {
        const effectiveSoulContent =
          agent.soulContent?.trim() ||
          generateDefaultSoul(agent.name, agent.role);
        const effectiveIdentityContent =
          agent.identityContent?.trim() ||
          buildDefaultIdentityContent(agent.name, agent.role);

        const rawSkillIds = agent.openclawConfig?.skillIds ?? [];
        const skillIds: Id<"skills">[] = rawSkillIds.filter(
          (id): id is Id<"skills"> =>
            typeof id === "string" && id.trim() !== "",
        );
        const resolvedSkills: Array<{
          _id: Id<"skills">;
          name: string;
          slug: string;
          description: string | undefined;
          contentMarkdown: string | undefined;
        }> = [];
        for (const skillId of skillIds) {
          const skill = await ctx.db.get(skillId);
          if (skill && skill.accountId === args.accountId && skill.isEnabled) {
            resolvedSkills.push({
              _id: skill._id,
              name: skill.name,
              slug: skill.slug,
              description: skill.description,
              contentMarkdown: skill.contentMarkdown ?? undefined,
            });
          }
        }

        return {
          _id: agent._id,
          name: agent.name,
          slug: agent.slug,
          role: agent.role,
          sessionKey: agent.sessionKey,
          openclawConfig: agent.openclawConfig,
          effectiveSoulContent,
          effectiveUserMd,
          effectiveIdentityContent,
          resolvedSkills,
        };
      }),
    );
  },
});

/**
 * List agents with resolved skill slugs (audit-friendly, no contentMarkdown).
 */
export const listSkillSlugsForAccount = internalQuery({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    return await Promise.all(
      agents.map(async (agent) => {
        const rawSkillIds = agent.openclawConfig?.skillIds ?? [];
        const skillIds: Id<"skills">[] = rawSkillIds.filter(
          (id): id is Id<"skills"> =>
            typeof id === "string" && id.trim() !== "",
        );
        const resolvedSkills: Array<{
          _id: Id<"skills">;
          name: string;
          slug: string;
        }> = [];
        for (const skillId of skillIds) {
          const skill = await ctx.db.get(skillId);
          if (skill && skill.accountId === args.accountId && skill.isEnabled) {
            resolvedSkills.push({
              _id: skill._id,
              name: skill.name,
              slug: skill.slug,
            });
          }
        }

        return {
          _id: agent._id,
          name: agent.name,
          slug: agent.slug,
          role: agent.role,
          resolvedSkills,
        };
      }),
    );
  },
});

/**
 * Get a task by ID (internal, no user auth required).
 * Helper to avoid service/tasks path typing issues.
 */
export const getTaskInternal = internalQuery({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.taskId);
  },
});

/**
 * Get agents that need heartbeat check.
 * Returns agents that haven't had a heartbeat in their expected interval.
 * Internal query - called only from service actions.
 */
export const getStaleAgents = internalQuery({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_account_status", (q) =>
        q.eq("accountId", args.accountId).eq("status", "online"),
      )
      .collect();

    const now = Date.now();
    const staleAgents = agents.filter((agent) => {
      if (!agent.lastHeartbeat) return true;

      const intervalMs = agent.heartbeatInterval * 60 * 1000; // Convert to ms
      const expectedBy = agent.lastHeartbeat + intervalMs + 60 * 1000; // Add 1 min grace

      return now > expectedBy;
    });

    return staleAgents;
  },
});
