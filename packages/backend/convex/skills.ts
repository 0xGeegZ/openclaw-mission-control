import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAccountMember, requireAccountAdmin } from "./lib/auth";
import { validateContentMarkdown } from "./lib/skills_validation";

/**
 * Skill category validator.
 */
const skillCategoryValidator = v.union(
  v.literal("mcp_server"),
  v.literal("tool"),
  v.literal("integration"),
  v.literal("custom"),
);

/**
 * List all skills for an account.
 * Any member can view skills.
 */
export const list = query({
  args: {
    accountId: v.id("accounts"),
    category: v.optional(skillCategoryValidator),
    enabledOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    let skills;

    if (args.category !== undefined) {
      const category = args.category; // Type narrowing
      skills = await ctx.db
        .query("skills")
        .withIndex("by_account_category", (q) =>
          q.eq("accountId", args.accountId).eq("category", category),
        )
        .collect();
    } else {
      skills = await ctx.db
        .query("skills")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
        .collect();
    }

    if (args.enabledOnly) {
      skills = skills.filter((s) => s.isEnabled);
    }

    return skills;
  },
});

/**
 * Get a single skill by ID.
 */
export const get = query({
  args: {
    skillId: v.id("skills"),
  },
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.skillId);
    if (!skill) return null;

    await requireAccountMember(ctx, skill.accountId);
    return skill;
  },
});

/**
 * Create a new skill. Requires admin role.
 * contentMarkdown is optional; when set, runtime materializes it as agentDir/skills/<slug>/SKILL.md.
 * contentMarkdown must not exceed CONTENT_MARKDOWN_MAX_BYTES (512 KB).
 */
export const create = mutation({
  args: {
    accountId: v.id("accounts"),
    name: v.string(),
    slug: v.string(),
    category: skillCategoryValidator,
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    contentMarkdown: v.optional(v.string()),
    config: v.object({
      serverUrl: v.optional(v.string()),
      authType: v.optional(
        v.union(v.literal("none"), v.literal("api_key"), v.literal("oauth")),
      ),
      credentialRef: v.optional(v.string()),
      toolParams: v.optional(v.any()),
      rateLimit: v.optional(v.number()),
      requiresApproval: v.optional(v.boolean()),
    }),
    isEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAccountAdmin(ctx, args.accountId);

    // Check slug uniqueness
    const existing = await ctx.db
      .query("skills")
      .withIndex("by_account_slug", (q) =>
        q.eq("accountId", args.accountId).eq("slug", args.slug),
      )
      .unique();

    if (existing) {
      throw new Error("Conflict: Skill slug already exists");
    }

    validateContentMarkdown(args.contentMarkdown);

    const now = Date.now();

    return ctx.db.insert("skills", {
      accountId: args.accountId,
      name: args.name,
      slug: args.slug,
      category: args.category,
      description: args.description,
      icon: args.icon,
      contentMarkdown: args.contentMarkdown,
      config: args.config,
      isEnabled: args.isEnabled ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update a skill. Requires admin role.
 * contentMarkdown is optional; when set, must not exceed CONTENT_MARKDOWN_MAX_BYTES (512 KB).
 */
export const update = mutation({
  args: {
    skillId: v.id("skills"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    contentMarkdown: v.optional(v.string()),
    config: v.optional(
      v.object({
        serverUrl: v.optional(v.string()),
        authType: v.optional(
          v.union(v.literal("none"), v.literal("api_key"), v.literal("oauth")),
        ),
        credentialRef: v.optional(v.string()),
        toolParams: v.optional(v.any()),
        rateLimit: v.optional(v.number()),
        requiresApproval: v.optional(v.boolean()),
      }),
    ),
    isEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.skillId);
    if (!skill) {
      throw new Error("Not found: Skill does not exist");
    }

    await requireAccountAdmin(ctx, skill.accountId);

    if (args.contentMarkdown !== undefined) {
      validateContentMarkdown(args.contentMarkdown);
    }

    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.icon !== undefined) updates.icon = args.icon;
    if (args.contentMarkdown !== undefined)
      updates.contentMarkdown = args.contentMarkdown;
    if (args.config !== undefined) updates.config = args.config;
    if (args.isEnabled !== undefined) updates.isEnabled = args.isEnabled;

    await ctx.db.patch(args.skillId, updates);
    return args.skillId;
  },
});

/**
 * Delete a skill.
 * Requires admin role.
 * Will remove from all agents using it.
 */
export const remove = mutation({
  args: {
    skillId: v.id("skills"),
  },
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.skillId);
    if (!skill) return true;

    await requireAccountAdmin(ctx, skill.accountId);

    // Remove skill from all agents that have it
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_account", (q) => q.eq("accountId", skill.accountId))
      .collect();

    for (const agent of agents) {
      if (agent.openclawConfig?.skillIds?.includes(args.skillId)) {
        const newSkillIds = agent.openclawConfig.skillIds.filter(
          (id) => id !== args.skillId,
        );
        await ctx.db.patch(agent._id, {
          openclawConfig: {
            ...agent.openclawConfig,
            skillIds: newSkillIds,
          },
        });
      }
    }

    await ctx.db.delete(args.skillId);
    return true;
  },
});

/**
 * Toggle skill enabled status.
 * Requires admin role.
 */
export const toggleEnabled = mutation({
  args: {
    skillId: v.id("skills"),
  },
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.skillId);
    if (!skill) {
      throw new Error("Not found: Skill does not exist");
    }

    await requireAccountAdmin(ctx, skill.accountId);

    await ctx.db.patch(args.skillId, {
      isEnabled: !skill.isEnabled,
      updatedAt: Date.now(),
    });

    return !skill.isEnabled;
  },
});
