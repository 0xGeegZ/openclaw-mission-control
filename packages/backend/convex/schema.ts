import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  taskStatusValidator,
  agentStatusValidator,
  memberRoleValidator,
  recipientTypeValidator,
  documentTypeValidator,
  documentKindValidator,
  notificationTypeValidator,
  activityTypeValidator,
  runtimeStatusValidator,
  runtimeV2StatusValidator,
  accountPlanValidator,
  skillCategoryValidator,
  invitationStatusValidator,
  runtimeProviderValidator,
  upgradeStatusValidator,
  upgradeStrategyValidator,
  actorTypeValidator,
  targetTypeValidator,
  authTypeValidator,
} from "./lib/validators";

/**
 * OpenClaw Mission Control Database Schema
 *
 * Multi-tenant architecture: Every table (except accounts) includes accountId.
 * All queries MUST filter by accountId to enforce tenant isolation.
 *
 * Validators imported from lib/validators.ts which reference constants
 * from lib/constants.ts — single source of truth for enum values.
 */

// ============================================================================
// Schema Definition
// ============================================================================

export default defineSchema({
  // ==========================================================================
  // ACCOUNTS
  // The root entity for multi-tenancy. Each account represents a customer.
  // ==========================================================================
  accounts: defineTable({
    /** Display name for the account */
    name: v.string(),

    /** URL-safe unique identifier */
    slug: v.string(),

    /** Subscription plan */
    plan: accountPlanValidator,

    /** Status of the per-account runtime server */
    runtimeStatus: runtimeStatusValidator,

    /** Runtime server configuration (populated after provisioning) */
    runtimeConfig: v.optional(
      v.object({
        /** DigitalOcean droplet ID */
        dropletId: v.string(),
        /** IP address of the runtime server */
        ipAddress: v.string(),
        /** Region where droplet is deployed */
        region: v.optional(v.string()),
        /** Last successful health check timestamp */
        lastHealthCheck: v.optional(v.number()),

        /** OpenClaw version running on this runtime (e.g., "v1.2.3" or git SHA) */
        openclawVersion: v.optional(v.string()),
        /** Runtime service Docker image tag */
        runtimeServiceVersion: v.optional(v.string()),
        /** Timestamp of last successful upgrade */
        lastUpgradeAt: v.optional(v.number()),
        /** Status of last upgrade attempt */
        lastUpgradeStatus: v.optional(upgradeStatusValidator),
      }),
    ),

    /** Timestamp of account creation */
    createdAt: v.number(),

    /** Service token hash for runtime authentication */
    serviceTokenHash: v.optional(v.string()),

    /** Workspace settings (theme, notification preferences, agent defaults). */
    settings: v.optional(
      v.object({
        theme: v.optional(v.string()),
        notificationPreferences: v.optional(
          v.object({
            taskUpdates: v.boolean(),
            agentActivity: v.boolean(),
            emailDigest: v.boolean(),
            memberUpdates: v.boolean(),
          }),
        ),
        /** Default OpenClaw config for new agents (admin-editable). */
        agentDefaults: v.optional(
          v.object({
            model: v.optional(v.string()),
            temperature: v.optional(v.number()),
            maxTokens: v.optional(v.number()),
            maxHistoryMessages: v.optional(v.number()),
            behaviorFlags: v.optional(
              v.object({
                canCreateTasks: v.boolean(),
                canModifyTaskStatus: v.boolean(),
                canCreateDocuments: v.boolean(),
                canMentionAgents: v.boolean(),
              }),
            ),
            rateLimits: v.optional(
              v.object({
                requestsPerMinute: v.optional(v.number()),
                tokensPerDay: v.optional(v.number()),
              }),
            ),
          }),
        ),
        /** Agent ID designated as squad lead/orchestrator (PM). Receives thread updates for all tasks. */
        orchestratorAgentId: v.optional(v.id("agents")),
        /** Task ID used for orchestrator chat (PM conversation thread). */
        orchestratorChatTaskId: v.optional(v.id("tasks")),
      }),
    ),
    /** Timestamp when admin requested runtime restart; runtime clears after restart. */
    restartRequestedAt: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_created", ["createdAt"]),

  // ==========================================================================
  // MEMBERSHIPS
  // Links users (from Clerk) to accounts with roles.
  // ==========================================================================
  memberships: defineTable({
    /** Reference to the account */
    accountId: v.id("accounts"),

    /** Clerk user ID (from auth identity) */
    userId: v.string(),

    /** User's display name (cached from Clerk) */
    userName: v.string(),

    /** User's email (cached from Clerk) */
    userEmail: v.string(),

    /** User's avatar URL (cached from Clerk) */
    userAvatarUrl: v.optional(v.string()),

    /** Role within the account */
    role: memberRoleValidator,

    /** Timestamp when user joined the account */
    joinedAt: v.number(),
  })
    .index("by_account", ["accountId"])
    .index("by_user", ["userId"])
    .index("by_account_user", ["accountId", "userId"]),

  // ==========================================================================
  // SKILLS
  // Reusable skill/tool definitions that can be assigned to agents.
  // Skills represent capabilities: MCP servers, tools, integrations.
  // ==========================================================================
  skills: defineTable({
    /** Account this skill belongs to */
    accountId: v.id("accounts"),

    /** Skill display name (e.g., "Web Search", "Code Execution") */
    name: v.string(),

    /** URL-safe identifier */
    slug: v.string(),

    /** Skill category */
    category: skillCategoryValidator,

    /** Detailed description of what this skill does */
    description: v.optional(v.string()),

    /** Icon for UI display */
    icon: v.optional(v.string()),

    /** Full SKILL.md body for custom/inline skills; when set, runtime materializes as agentDir/skills/<slug>/SKILL.md. Max length enforced in create/update: 512 KB (CONTENT_MARKDOWN_MAX_BYTES in lib/skills_validation). */
    contentMarkdown: v.optional(v.string()),

    /**
     * Skill configuration (varies by category).
     * For MCP: server URL, auth config
     * For tools: tool name, parameters
     * For integrations: API keys, endpoints
     */
    config: v.object({
      /** For MCP servers: the server identifier/URL */
      serverUrl: v.optional(v.string()),

      /** For MCP servers: authentication method */
      authType: v.optional(authTypeValidator),

      /** Encrypted credentials reference (stored in env, not here) */
      credentialRef: v.optional(v.string()),

      /** Tool-specific parameters */
      toolParams: v.optional(v.any()),

      /** Rate limit (requests per minute) */
      rateLimit: v.optional(v.number()),

      /** Whether this skill requires approval before use */
      requiresApproval: v.optional(v.boolean()),
    }),

    /** Is this skill enabled? */
    isEnabled: v.boolean(),

    /** Timestamp of creation */
    createdAt: v.number(),

    /** Timestamp of last update */
    updatedAt: v.number(),
  })
    .index("by_account", ["accountId"])
    .index("by_account_category", ["accountId", "category"])
    .index("by_account_slug", ["accountId", "slug"]),

  // ==========================================================================
  // AGENTS
  // AI agent definitions. Each agent maps to an OpenClaw session.
  // ==========================================================================
  agents: defineTable({
    /** Account this agent belongs to */
    accountId: v.id("accounts"),

    /** Display name (e.g., "Jarvis", "Vision") */
    name: v.string(),

    /** URL-safe identifier (e.g., "jarvis", "vision") */
    slug: v.string(),

    /** Role description (e.g., "Squad Lead", "SEO Analyst") */
    role: v.string(),

    /** Detailed description of agent's responsibilities */
    description: v.optional(v.string()),

    /**
     * OpenClaw session key.
     * Format: agent:{slug}:{accountId}
     */
    sessionKey: v.string(),

    /** Current operational status */
    status: agentStatusValidator,

    /** Currently assigned task (if any) */
    currentTaskId: v.optional(v.id("tasks")),

    /** Timestamp of last heartbeat */
    lastHeartbeat: v.optional(v.number()),

    /** Heartbeat interval in minutes (e.g., 15) */
    heartbeatInterval: v.number(),

    /** Avatar/icon URL */
    avatarUrl: v.optional(v.string()),

    /** Lucide icon name for UI when avatarUrl is not set (e.g. "Crown", "Code2") */
    icon: v.optional(v.string()),

    /**
     * SOUL file content.
     * Contains personality, constraints, and operating procedures.
     */
    soulContent: v.optional(v.string()),

    /**
     * OpenClaw runtime configuration.
     * Controls LLM settings, skills, and behavior.
     */
    openclawConfig: v.optional(
      v.object({
        /** LLM model identifier (e.g., "claude-sonnet-4-20250514", "gpt-4o") */
        model: v.string(),

        /** Temperature for response generation (0.0 - 2.0) */
        temperature: v.number(),

        /** Maximum tokens in response */
        maxTokens: v.optional(v.number()),

        /** System prompt prefix (prepended to SOUL) */
        systemPromptPrefix: v.optional(v.string()),

        /** Assigned skill IDs */
        skillIds: v.array(v.id("skills")),

        /** Context/memory settings */
        contextConfig: v.optional(
          v.object({
            /** Max conversation history to include */
            maxHistoryMessages: v.number(),
            /** Whether to include task context automatically */
            includeTaskContext: v.boolean(),
            /** Whether to include team activity context */
            includeTeamContext: v.boolean(),
            /** Custom context sources */
            customContextSources: v.optional(v.array(v.string())),
          }),
        ),

        /** Rate limiting */
        rateLimits: v.optional(
          v.object({
            /** Max requests per minute */
            requestsPerMinute: v.number(),
            /** Max tokens per day */
            tokensPerDay: v.optional(v.number()),
          }),
        ),

        /** Behavior flags */
        behaviorFlags: v.optional(
          v.object({
            /** Can agent create tasks? */
            canCreateTasks: v.boolean(),
            /** Can agent modify task status? */
            canModifyTaskStatus: v.boolean(),
            /** Can agent create documents? */
            canCreateDocuments: v.boolean(),
            /** Can agent mention other agents? */
            canMentionAgents: v.boolean(),
            /** Requires human approval for certain actions? */
            requiresApprovalForActions: v.optional(v.array(v.string())),
          }),
        ),
      }),
    ),

    /** Timestamp of creation */
    createdAt: v.number(),
  })
    .index("by_account", ["accountId"])
    .index("by_account_status", ["accountId", "status"])
    .index("by_account_slug", ["accountId", "slug"])
    .index("by_session_key", ["sessionKey"]),

  // ==========================================================================
  // TASKS
  // Kanban tasks that flow through the workflow.
  // ==========================================================================
  tasks: defineTable({
    /** Account this task belongs to */
    accountId: v.id("accounts"),

    /** Task title */
    title: v.string(),

    /** Detailed description (Markdown supported) */
    description: v.optional(v.string()),

    /** Current status in the workflow */
    status: taskStatusValidator,

    /** Priority level (1 = highest, 5 = lowest) */
    priority: v.number(),

    /**
     * Assigned users (Clerk user IDs).
     * Can be empty if task is in inbox.
     */
    assignedUserIds: v.array(v.string()),

    /**
     * Assigned agents.
     * Can be empty if task is in inbox.
     */
    assignedAgentIds: v.array(v.id("agents")),

    /** Labels/tags for categorization */
    labels: v.array(v.string()),

    /** Due date timestamp (optional) */
    dueDate: v.optional(v.number()),

    /**
     * Blocked reason.
     * Required when status is "blocked".
     */
    blockedReason: v.optional(v.string()),

    /**
     * Timestamp when task was archived (soft delete).
     * Set only when status is "archived"; used for audit trail.
     */
    archivedAt: v.optional(v.number()),

    /**
     * Metadata for external integrations.
     * Currently used for GitHub PR links: { prNumber: 65 }
     */
    metadata: v.optional(
      v.object({
        prNumber: v.optional(v.number()),
      }),
    ),

    /** Creator user ID */
    createdBy: v.string(),

    /** Timestamp of creation */
    createdAt: v.number(),

    /** Timestamp of last update */
    updatedAt: v.number(),

    /**
     * Timestamp of the most recent message in the task thread.
     * Used to order tasks in the Kanban by last activity.
     */
    lastMessageAt: v.optional(v.number()),
  })
    .index("by_account", ["accountId"])
    .index("by_account_status", ["accountId", "status"])
    .index("by_account_priority", ["accountId", "priority"])
    .index("by_account_created", ["accountId", "createdAt"]),

  // ==========================================================================
  // MESSAGES
  // Comments/messages in task threads.
  // ==========================================================================
  messages: defineTable({
    /** Account (for tenant filtering) */
    accountId: v.id("accounts"),

    /** Task this message belongs to */
    taskId: v.id("tasks"),

    /**
     * Author type.
     * Determines how to interpret authorId.
     */
    authorType: recipientTypeValidator,

    /**
     * Author ID.
     * If authorType="user": Clerk user ID
     * If authorType="agent": Agent document ID
     */
    authorId: v.string(),

    /** Message content (Markdown supported) */
    content: v.string(),

    /**
     * Parsed mentions.
     * List of mentioned entity identifiers.
     */
    mentions: v.array(
      v.object({
        type: recipientTypeValidator,
        id: v.string(),
        /** Display name at time of mention */
        name: v.string(),
        /** Agent slug at time of mention (for @slug rendering). */
        slug: v.optional(v.string()),
      }),
    ),

    /** Attached files (optional). storageId for Convex uploads; url optional for legacy or resolved at write. */
    attachments: v.optional(
      v.array(
        v.object({
          /** Convex storage ID (present for uploads via generateUploadUrl). */
          storageId: v.optional(v.id("_storage")),
          /** Resolved or legacy URL. */
          url: v.optional(v.string()),
          name: v.string(),
          type: v.string(),
          size: v.number(),
        }),
      ),
    ),

    /** Timestamp of creation */
    createdAt: v.number(),

    /** Timestamp of last edit (if edited) */
    editedAt: v.optional(v.number()),

    /** Idempotency: notification that triggered this agent message (prevents duplicate write-back). */
    sourceNotificationId: v.optional(v.id("notifications")),
  })
    .index("by_task", ["taskId"])
    .index("by_task_created", ["taskId", "createdAt"])
    .index("by_task_author_created", [
      "taskId",
      "authorType",
      "authorId",
      "createdAt",
    ])
    .index("by_account", ["accountId"])
    .index("by_account_created", ["accountId", "createdAt"])
    .index("by_author", ["authorType", "authorId"])
    .index("by_source_notification", ["sourceNotificationId"]),

  // ==========================================================================
  // MESSAGE UPLOADS
  // Tracks uploaded files tied to a task/account for attachment scoping.
  // ==========================================================================
  messageUploads: defineTable({
    /** Account (for tenant filtering) */
    accountId: v.id("accounts"),

    /** Task this upload is associated with */
    taskId: v.id("tasks"),

    /** Storage ID for the uploaded file */
    storageId: v.id("_storage"),

    /** Who registered the upload */
    createdByType: recipientTypeValidator,

    /** User ID or agent ID depending on createdByType */
    createdBy: v.string(),

    /** Timestamp of creation */
    createdAt: v.number(),
  })
    .index("by_account_task_storage", ["accountId", "taskId", "storageId"])
    .index("by_storage", ["storageId"])
    .index("by_account_created", ["accountId", "createdAt"]),

  // ==========================================================================
  // DOCUMENTS
  // Markdown documents (deliverables, notes, templates).
  // ==========================================================================
  documents: defineTable({
    /** Account this document belongs to */
    accountId: v.id("accounts"),

    /** Parent folder (undefined = root). Enables file/folder tree. */
    parentId: v.optional(v.id("documents")),

    /** Kind: file (default) or folder. Folders have no content. */
    kind: v.optional(documentKindValidator),

    /** Display name (folders use this; files use title if name omitted). */
    name: v.optional(v.string()),

    /** Associated task (optional) */
    taskId: v.optional(v.id("tasks")),

    /** Document title (files; required for backward compatibility) */
    title: v.optional(v.string()),

    /** Document content (Markdown). Optional for folders. */
    content: v.optional(v.string()),

    /** Document type (deliverable/note/template/reference). Files only. */
    type: v.optional(documentTypeValidator),

    /** MIME type of the file (e.g., "text/markdown"). Optional for folders. */
    mimeType: v.optional(v.string()),

    /** Size of the file in bytes. Optional for folders. */
    size: v.optional(v.number()),

    /**
     * Author type.
     */
    authorType: recipientTypeValidator,

    /**
     * Author ID.
     */
    authorId: v.string(),

    /** Version number (incremented on each edit). Files only. */
    version: v.optional(v.number()),

    /** Timestamp of creation */
    createdAt: v.number(),

    /** Timestamp of last update */
    updatedAt: v.number(),

    /** Timestamp of soft delete (for audit trail). null = not deleted. */
    deletedAt: v.optional(v.number()),
  })
    .index("by_account", ["accountId"])
    .index("by_parent", ["accountId", "parentId"])
    .index("by_parent_name", ["parentId", "name"])
    .index("by_account_type", ["accountId", "type"])
    .index("by_task", ["taskId"])
    .index("by_account_updated", ["accountId", "updatedAt"])
    .index("by_account_deleted", ["accountId", "deletedAt"]),

  // ==========================================================================
  // ACTIVITIES
  // Audit trail / activity feed.
  // Append-only: never edited, only inserted.
  // ==========================================================================
  activities: defineTable({
    /** Account this activity belongs to */
    accountId: v.id("accounts"),

    /** Activity type */
    type: activityTypeValidator,

    /**
     * Actor type (who performed the action).
     * Can be "user", "agent", or "system".
     */
    actorType: actorTypeValidator,

    /**
     * Actor ID.
     * If actorType="user": Clerk user ID
     * If actorType="agent": Agent document ID
     * If actorType="system": "system"
     */
    actorId: v.string(),

    /** Actor display name (cached) */
    actorName: v.string(),

    /**
     * Target entity type.
     * What the action was performed on.
     */
    targetType: targetTypeValidator,

    /** Target entity ID */
    targetId: v.string(),

    /** Target display name (cached) */
    targetName: v.optional(v.string()),

    /**
     * Additional metadata.
     * Varies by activity type (e.g., old/new status for status changes).
     */
    meta: v.optional(v.any()),

    /** Timestamp of activity */
    createdAt: v.number(),
  })
    .index("by_account", ["accountId"])
    .index("by_account_created", ["accountId", "createdAt"])
    .index("by_target", ["targetType", "targetId"])
    .index("by_actor", ["actorType", "actorId"]),

  // ==========================================================================
  // NOTIFICATIONS
  // Delivery queue for mentions, assignments, and thread updates.
  // ==========================================================================
  notifications: defineTable({
    /** Account this notification belongs to */
    accountId: v.id("accounts"),

    /** Notification type */
    type: notificationTypeValidator,

    /**
     * Recipient type.
     */
    recipientType: recipientTypeValidator,

    /**
     * Recipient ID.
     * If recipientType="user": Clerk user ID
     * If recipientType="agent": Agent document ID
     */
    recipientId: v.string(),

    /** Source task (if applicable) */
    taskId: v.optional(v.id("tasks")),

    /** Source message (if applicable) */
    messageId: v.optional(v.id("messages")),

    /** Notification title/summary */
    title: v.string(),

    /** Notification body/content */
    body: v.string(),

    /**
     * Delivery status.
     * null = not delivered
     * timestamp = delivered at
     */
    deliveredAt: v.optional(v.number()),

    /**
     * Read status.
     * null = not read
     * timestamp = read at
     */
    readAt: v.optional(v.number()),

    /** Timestamp of creation */
    createdAt: v.number(),
  })
    .index("by_account_recipient", [
      "accountId",
      "recipientType",
      "recipientId",
    ])
    .index("by_account_undelivered", [
      "accountId",
      "recipientType",
      "deliveredAt",
    ])
    .index("by_recipient_unread", ["recipientType", "recipientId", "readAt"])
    .index("by_account_created", ["accountId", "createdAt"])
    .index("by_task", ["taskId"])
    .index("by_task_created", ["taskId", "createdAt"])
    .index("by_task_recipient_id_created", [
      "taskId",
      "recipientId",
      "createdAt",
    ])
    .index("by_task_recipient_created", [
      "taskId",
      "recipientType",
      "createdAt",
    ]),

  // ==========================================================================
  // SUBSCRIPTIONS
  // Thread subscriptions for automatic notifications.
  // ==========================================================================
  subscriptions: defineTable({
    /** Account (for tenant filtering) */
    accountId: v.id("accounts"),

    /** Task being subscribed to */
    taskId: v.id("tasks"),

    /**
     * Subscriber type.
     */
    subscriberType: recipientTypeValidator,

    /**
     * Subscriber ID.
     */
    subscriberId: v.string(),

    /** Timestamp of subscription */
    subscribedAt: v.number(),
  })
    .index("by_task", ["taskId"])
    .index("by_subscriber", ["subscriberType", "subscriberId"])
    .index("by_task_subscriber", ["taskId", "subscriberType", "subscriberId"])
    .index("by_account_created", ["accountId", "subscribedAt"]),

  // ==========================================================================
  // INVITATIONS
  // Email-based invites to join an account (pending/accepted/expired).
  // ==========================================================================
  invitations: defineTable({
    accountId: v.id("accounts"),
    email: v.string(),
    role: memberRoleValidator,
    invitedBy: v.string(),
    /** Unique token for invite link (e.g. /invite/[token]). Set when creating. */
    token: v.optional(v.string()),
    status: invitationStatusValidator,
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_account", ["accountId"])
    .index("by_email", ["email"])
    .index("by_account_status", ["accountId", "status"])
    .index("by_token", ["token"]),

  // ==========================================================================
  // RUNTIMES (v2)
  // Dedicated runtime per account for fleet management and upgrades.
  // ==========================================================================
  runtimes: defineTable({
    accountId: v.id("accounts"),
    provider: runtimeProviderValidator,
    providerId: v.string(),
    ipAddress: v.string(),
    region: v.string(),
    openclawVersion: v.string(),
    runtimeServiceVersion: v.string(),
    dockerImageTag: v.string(),
    status: runtimeV2StatusValidator,
    lastHealthCheck: v.optional(v.number()),
    healthScore: v.optional(v.number()),
    /** Pending upgrade request (cleared after runtime applies or cancels). */
    pendingUpgrade: v.optional(
      v.object({
        targetOpenclawVersion: v.string(),
        targetRuntimeVersion: v.string(),
        initiatedAt: v.number(),
        initiatedBy: v.string(),
        strategy: upgradeStrategyValidator,
      }),
    ),
    /** Last N upgrade results for fleet UI. */
    upgradeHistory: v.optional(
      v.array(
        v.object({
          fromOpenclawVersion: v.string(),
          toOpenclawVersion: v.string(),
          fromRuntimeVersion: v.string(),
          toRuntimeVersion: v.string(),
          status: upgradeStatusValidator,
          startedAt: v.number(),
          completedAt: v.optional(v.number()),
          duration: v.optional(v.number()),
          error: v.optional(v.string()),
          initiatedBy: v.string(),
        }),
      ),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_account", ["accountId"])
    .index("by_status", ["status"])
    .index("by_openclaw_version", ["openclawVersion"]),

  // ==========================================================================
  // STANDUP SUMMARIES
  // Daily standup aggregation (completed today, in progress, blocked, review).
  // ==========================================================================
  standupSummaries: defineTable({
    accountId: v.id("accounts"),
    date: v.string(),
    summary: v.object({
      completedToday: v.number(),
      inProgress: v.number(),
      blocked: v.number(),
      needsReview: v.number(),
      taskIdsCompletedToday: v.array(v.id("tasks")),
      taskIdsInProgress: v.array(v.id("tasks")),
      taskIdsBlocked: v.array(v.id("tasks")),
      taskIdsNeedsReview: v.array(v.id("tasks")),
    }),
    createdAt: v.number(),
  })
    .index("by_account", ["accountId"])
    .index("by_account_date", ["accountId", "date"]),

  // ==========================================================================
  // SYSTEM CONFIG (key-value)
  // Feature flags and orchestration config (e.g. fleet_orchestration_enabled, canary_account_id).
  // ==========================================================================
  systemConfig: defineTable({
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // ==========================================================================
  // BILLING SUBSCRIPTIONS
  // Stripe subscription management for plan upgrades and billing.
  // ==========================================================================
  billingSubscriptions: defineTable({
    /** Account this subscription belongs to */
    accountId: v.id("accounts"),

    /** Stripe customer ID */
    stripeCustomerId: v.string(),

    /** Stripe subscription ID */
    stripeSubscriptionId: v.string(),

    /** Stripe price ID (identifies the plan tier) */
    stripePriceId: v.string(),

    /** Current subscription plan */
    plan: v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise")),

    /** Subscription status from Stripe */
    status: v.union(
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("incomplete"),
      v.literal("trialing"),
      v.literal("unpaid"),
    ),

    /** Current billing period start (Unix timestamp) */
    currentPeriodStart: v.number(),

    /** Current billing period end (Unix timestamp) */
    currentPeriodEnd: v.number(),

    /** Whether subscription will cancel at period end */
    cancelAtPeriodEnd: v.boolean(),

    /** Trial end date (optional, Unix timestamp) */
    trialEnd: v.optional(v.number()),

    /** Timestamp of creation */
    createdAt: v.number(),

    /** Timestamp of last update */
    updatedAt: v.number(),
  })
    .index("by_account", ["accountId"])
    .index("by_stripe_customer", ["stripeCustomerId"])
    .index("by_stripe_subscription", ["stripeSubscriptionId"]),

  // ==========================================================================
  // INVOICES
  // Track Stripe invoices for billing history and downloads.
  // ==========================================================================
  invoices: defineTable({
    /** Account this invoice belongs to */
    accountId: v.id("accounts"),

    /** Stripe invoice ID */
    stripeInvoiceId: v.string(),

    /** Stripe customer ID */
    stripeCustomerId: v.string(),

    /** Amount due in cents */
    amountDue: v.number(),

    /** Amount paid in cents */
    amountPaid: v.number(),

    /** Currency code (e.g., "usd") */
    currency: v.string(),

    /** Invoice status from Stripe */
    status: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("paid"),
      v.literal("void"),
      v.literal("uncollectible"),
    ),

    /** Hosted invoice URL (Stripe-hosted page) */
    hostedInvoiceUrl: v.optional(v.string()),

    /** Invoice PDF URL */
    invoicePdf: v.optional(v.string()),

    /** Billing period start (Unix timestamp) */
    periodStart: v.number(),

    /** Billing period end (Unix timestamp) */
    periodEnd: v.number(),

    /** Timestamp of invoice creation */
    createdAt: v.number(),
  })
    .index("by_account", ["accountId"])
    .index("by_account_created", ["accountId", "createdAt"])
    .index("by_stripe_invoice", ["stripeInvoiceId"]),

  // ==========================================================================
  // USAGE RECORDS
  // Track monthly usage for plan limits and metering.
  // ==========================================================================
  usageRecords: defineTable({
    /** Account this usage record belongs to */
    accountId: v.id("accounts"),

    /** Period in YYYY-MM format */
    period: v.string(),

    /** Number of agents created this period */
    agents: v.number(),

    /** Number of tasks created this period */
    tasks: v.number(),

    /** Number of messages sent this period */
    messages: v.number(),

    /** Number of documents created this period */
    documents: v.number(),

    /** Storage used in bytes */
    storageBytes: v.number(),

    /** Timestamp of creation */
    createdAt: v.number(),

    /** Timestamp of last update */
    updatedAt: v.number(),
  })
    .index("by_account_period", ["accountId", "period"])
    .index("by_period", ["period"]),

  // ==========================================================================
  // BILLING ACTIONS / AUDIT TRAIL
  // Track user actions related to billing (upgrades, downgrades, cancellations).
  // ==========================================================================
  billingActions: defineTable({
    /** Account this action belongs to */
    accountId: v.id("accounts"),

    /** User ID who performed the action (or "system" for webhook events) */
    userId: v.string(),

    /** Type of billing action (spec: plan_upgraded, plan_downgraded, plan_renewed, plan_cancelled, payment_failed, invoice_paid, usage_limit_exceeded, customer_portal_accessed) */
    actionType: v.union(
      v.literal("plan_upgraded"),
      v.literal("plan_downgraded"),
      v.literal("plan_renewed"),
      v.literal("plan_cancelled"),
      v.literal("payment_failed"),
      v.literal("invoice_paid"),
      v.literal("usage_limit_exceeded"),
      v.literal("customer_portal_accessed"),
    ),

    /** Human-readable description of the action */
    description: v.optional(v.string()),

    /** Detailed context about the action */
    details: v.optional(
      v.object({
        old_plan: v.optional(v.string()), // e.g., "free", "pro", "enterprise"
        new_plan: v.optional(v.string()), // e.g., "free", "pro", "enterprise"
        amount: v.optional(v.number()), // Amount in cents
        amount_currency: v.optional(v.string()), // e.g., "usd"
        invoice_id: v.optional(v.string()), // Stripe invoice ID
        stripe_subscription_id: v.optional(v.string()), // Stripe subscription ID
        stripe_customer_id: v.optional(v.string()), // Stripe customer ID
        stripe_price_id: v.optional(v.string()), // Stripe price ID
        stripe_event_id: v.optional(v.string()), // Stripe event ID for webhook tracking
      }),
    ),

    /** Additional metadata and context */
    metadata: v.optional(
      v.object({
        reason: v.optional(v.string()), // User-provided reason (e.g., cancellation feedback)
        reason_code: v.optional(v.string()), // e.g., "too_expensive", "unused", "switching"
        feedback_text: v.optional(v.string()), // Extended user feedback
        ip_address: v.optional(v.string()),
        user_agent: v.optional(v.string()),
      }),
    ),

    /** Timestamp of the action (Unix milliseconds) */
    timestamp: v.number(),
  })
    .index("by_account", ["accountId"])
    .index("by_account_timestamp", ["accountId", "timestamp"])
    .index("by_user", ["userId"])
    .index("by_action_type", ["actionType"])
    .index("by_account_action", ["accountId", "actionType"]),

  // ==========================================================================
  // CONTAINERS
  // Docker containers provisioned for accounts. Subject to quota limits.
  // ==========================================================================
  containers: defineTable({
    accountId: v.id("accounts"),
    name: v.string(),
    imageTag: v.string(),
    config: v.object({
      cpuLimit: v.optional(v.number()),
      memoryLimit: v.optional(v.number()),
      envVars: v.optional(v.object({})),
    }),
    status: v.string(), // provisioning, running, stopped, error
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_account", ["accountId"]),

  // ==========================================================================
  // USAGE TRACKING
  // Per-account quota tracking for subscription enforcement.
  // Tracks messages, API calls, agents, and containers per plan tier.
  // ==========================================================================
  usage: defineTable({
    accountId: v.id("accounts"),
    planId: accountPlanValidator,

    // Monthly message tracking
    messagesThisMonth: v.number(),
    messagesMonthStart: v.number(), // timestamp when current month started

    // Daily API calls tracking
    apiCallsToday: v.number(),
    apiCallsDayStart: v.number(), // timestamp when current day started

    // Real-time resource counts
    agentCount: v.number(),
    containerCount: v.number(),

    // Reset configuration
    resetCycle: v.union(v.literal("monthly"), v.literal("yearly")),
    lastReset: v.number(), // timestamp of last reset

    updatedAt: v.number(),
  })
    .index("by_account", ["accountId"]),
});
