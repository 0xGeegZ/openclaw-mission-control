import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAccountMember, requireAccountAdmin } from "./lib/auth";
import { generateDefaultSoul } from "./lib/agent_soul";
import { Id } from "./_generated/dataModel";

/**
 * Process placeholders in SOUL template.
 * Replaces {{agentName}}, {{role}} with actual values.
 */
function processSoulTemplate(template: string, agentName: string, role: string): string {
  return template
    .replace(/\{\{agentName\}\}/g, agentName)
    .replace(/\{\{role\}\}/g, role);
}

/**
 * List all agent templates available to an account.
 * Includes account-specific templates + public system templates.
 */
export const list = query({
  args: {
    accountId: v.id("accounts"),
    category: v.optional(v.string()),
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    // Get account-specific templates
    const accountTemplates = await ctx.db
      .query("agentTemplates")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    // Get public system templates
    const publicTemplates = await ctx.db
      .query("agentTemplates")
      .withIndex("by_public", (q) => q.eq("isPublic", true))
      .collect();

    let templates = [...accountTemplates, ...publicTemplates];

    // Filter by category if provided
    if (args.category) {
      templates = templates.filter((t) => t.category === args.category);
    }

    // Filter by search term if provided
    if (args.searchTerm) {
      const term = args.searchTerm.toLowerCase();
      templates = templates.filter(
        (t) =>
          t.name.toLowerCase().includes(term) ||
          t.description.toLowerCase().includes(term),
      );
    }

    // Sort by category, then by usage count (descending)
    return templates.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return b.usageCount - a.usageCount;
    });
  },
});

/**
 * Get a single template by ID.
 */
export const get = query({
  args: {
    templateId: v.id("agentTemplates"),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) return null;

    // Verify access: must be account member if account-specific
    if (template.accountId) {
      await requireAccountMember(ctx, template.accountId);
    }

    return template;
  },
});

/**
 * Create a new template in an account.
 * Only admins can create templates.
 */
export const create = mutation({
  args: {
    accountId: v.id("accounts"),
    name: v.string(),
    slug: v.string(),
    category: v.string(),
    description: v.string(),
    version: v.string(),
    config: v.object({
      role: v.string(),
      avatarUrl: v.optional(v.string()),
      heartbeatInterval: v.number(),
      model: v.string(),
      temperature: v.number(),
      maxTokens: v.optional(v.number()),
      canCreateTasks: v.boolean(),
      canModifyTaskStatus: v.boolean(),
      canCreateDocuments: v.boolean(),
      canMentionAgents: v.boolean(),
      maxHistoryMessages: v.number(),
      includeTaskContext: v.boolean(),
      includeTeamContext: v.boolean(),
    }),
    defaultSkillSlugs: v.array(v.string()),
    soulTemplate: v.string(),
    isPublic: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAccountAdmin(ctx, args.accountId);

    const now = Date.now();
    const templateId = await ctx.db.insert("agentTemplates", {
      accountId: args.accountId,
      name: args.name,
      slug: args.slug,
      category: args.category,
      description: args.description,
      version: args.version,
      config: args.config,
      defaultSkillSlugs: args.defaultSkillSlugs,
      soulTemplate: args.soulTemplate,
      isPublic: args.isPublic,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    return await ctx.db.get(templateId);
  },
});

/**
 * Update an existing template.
 * Only admins can update templates.
 */
export const update = mutation({
  args: {
    templateId: v.id("agentTemplates"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    version: v.optional(v.string()),
    config: v.optional(
      v.object({
        role: v.optional(v.string()),
        avatarUrl: v.optional(v.string()),
        heartbeatInterval: v.optional(v.number()),
        model: v.optional(v.string()),
        temperature: v.optional(v.number()),
        maxTokens: v.optional(v.number()),
        canCreateTasks: v.optional(v.boolean()),
        canModifyTaskStatus: v.optional(v.boolean()),
        canCreateDocuments: v.optional(v.boolean()),
        canMentionAgents: v.optional(v.boolean()),
        maxHistoryMessages: v.optional(v.number()),
        includeTaskContext: v.optional(v.boolean()),
        includeTeamContext: v.optional(v.boolean()),
      }),
    ),
    defaultSkillSlugs: v.optional(v.array(v.string())),
    soulTemplate: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");

    // Verify admin access
    if (template.accountId) {
      await requireAccountAdmin(ctx, template.accountId);
    }

    // Merge updates
    const updated = {
      name: args.name ?? template.name,
      description: args.description ?? template.description,
      category: args.category ?? template.category,
      version: args.version ?? template.version,
      config: args.config ? { ...template.config, ...args.config } : template.config,
      defaultSkillSlugs: args.defaultSkillSlugs ?? template.defaultSkillSlugs,
      soulTemplate: args.soulTemplate ?? template.soulTemplate,
      isPublic: args.isPublic ?? template.isPublic,
      updatedAt: Date.now(),
    };

    await ctx.db.patch(args.templateId, updated);
    return await ctx.db.get(args.templateId);
  },
});

/**
 * Delete a template.
 * Only admins can delete templates.
 */
export const deleteTemplate = mutation({
  args: {
    templateId: v.id("agentTemplates"),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");

    if (template.accountId) {
      await requireAccountAdmin(ctx, template.accountId);
    }

    await ctx.db.delete(args.templateId);
    return { success: true };
  },
});

/**
 * Create an agent from a template.
 * Handles skill assignment and SOUL content generation.
 */
export const createAgentFromTemplate = mutation({
  args: {
    accountId: v.id("accounts"),
    templateId: v.id("agentTemplates"),
    agentName: v.string(),
    agentSlug: v.string(),
    overrides: v.optional(
      v.object({
        role: v.optional(v.string()),
        heartbeatInterval: v.optional(v.number()),
        soulContent: v.optional(v.string()),
        skillSlugs: v.optional(v.array(v.string())),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    // Get template
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");

    // Generate session key
    const sessionKey = `agent:${args.agentSlug}:${args.accountId}`;

    // Process SOUL template
    const role = args.overrides?.role ?? template.config.role;
    const soulContent =
      args.overrides?.soulContent ??
      processSoulTemplate(template.soulTemplate, args.agentName, role);

    // Get skills - resolve skill IDs from slugs
    const skillSlugs = args.overrides?.skillSlugs ?? template.defaultSkillSlugs;
    const skills = await ctx.db
      .query("skills")
      .filter((q) => q.eq(q.field("accountId"), args.accountId))
      .collect();

    const skillIds = skillSlugs
      .map((slug) => skills.find((s) => s.slug === slug)?._id)
      .filter((id) => id !== undefined) as Id<"skills">[];

    // Create agent
    const now = Date.now();
    const agentId = await ctx.db.insert("agents", {
      accountId: args.accountId,
      name: args.agentName,
      slug: args.agentSlug,
      role,
      description: template.description,
      sessionKey,
      status: "offline",
      heartbeatInterval: args.overrides?.heartbeatInterval ?? template.config.heartbeatInterval,
      avatarUrl: template.config.avatarUrl,
      soulContent,
      openclawConfig: {
        model: template.config.model,
        temperature: template.config.temperature,
        maxTokens: template.config.maxTokens,
        skillIds,
        contextConfig: {
          maxHistoryMessages: template.config.maxHistoryMessages,
          includeTaskContext: template.config.includeTaskContext,
          includeTeamContext: template.config.includeTeamContext,
        },
        behaviorFlags: {
          canCreateTasks: template.config.canCreateTasks,
          canModifyTaskStatus: template.config.canModifyTaskStatus,
          canCreateDocuments: template.config.canCreateDocuments,
          canMentionAgents: template.config.canMentionAgents,
        },
      },
      createdAt: now,
    });

    // Increment template usage count
    await ctx.db.patch(args.templateId, {
      usageCount: template.usageCount + 1,
      updatedAt: now,
    });

    return await ctx.db.get(agentId);
  },
});

/**
 * List agent templates by category.
 * Useful for template gallery UI.
 */
export const listByCategory = query({
  args: {
    accountId: v.id("accounts"),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    // Get account-specific templates
    const accountTemplates = await ctx.db
      .query("agentTemplates")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .filter((q) => q.eq(q.field("category"), args.category))
      .collect();

    // Get public templates
    const publicTemplates = await ctx.db
      .query("agentTemplates")
      .withIndex("by_public", (q) => q.eq("isPublic", true))
      .filter((q) => q.eq(q.field("category"), args.category))
      .collect();

    const templates = [...accountTemplates, ...publicTemplates];

    // Sort by usage count (most popular first)
    return templates.sort((a, b) => b.usageCount - a.usageCount);
  },
});

/**
 * Get all distinct categories available.
 */
export const getCategories = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    // Get all templates the account can see
    const accountTemplates = await ctx.db
      .query("agentTemplates")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    const publicTemplates = await ctx.db
      .query("agentTemplates")
      .withIndex("by_public", (q) => q.eq("isPublic", true))
      .collect();

    const allTemplates = [...accountTemplates, ...publicTemplates];

    // Extract unique categories
    const categories = Array.from(new Set(allTemplates.map((t) => t.category)));

    return categories.sort();
  },
});
