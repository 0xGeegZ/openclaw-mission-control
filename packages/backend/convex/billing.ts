import { v } from "convex/values";
import type Stripe from "stripe";
import { mutation, query, internalMutation, action } from "./_generated/server";
import { requireAccountMember } from "./lib/auth";
import { api, internal } from "./_generated/api";

/**
 * Billing & Subscription Management
 *
 * Integrates with Stripe for subscription management, invoices, and usage tracking.
 */

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get the current subscription for an account.
 * Returns null if no subscription exists (free plan).
 */
export const getSubscription = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    const subscription = await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .first();

    return subscription;
  },
});

/**
 * List invoices for an account.
 * Returns most recent invoices first.
 */
export const listInvoices = query({
  args: {
    accountId: v.id("accounts"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_account_created", (q) => q.eq("accountId", args.accountId))
      .order("desc")
      .take(args.limit ?? 20);

    return invoices;
  },
});

/**
 * Get current usage for an account in the current billing period.
 * Returns usage metrics: agents, tasks, messages, documents, storage.
 */
export const getCurrentUsage = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    // Get current period (YYYY-MM)
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const usageRecord = await ctx.db
      .query("usageRecords")
      .withIndex("by_account_period", (q) =>
        q.eq("accountId", args.accountId).eq("period", period),
      )
      .first();

    if (!usageRecord) {
      // No usage yet this period, return zeros
      return {
        period,
        agents: 0,
        tasks: 0,
        messages: 0,
        documents: 0,
        storageBytes: 0,
      };
    }

    return usageRecord;
  },
});

/**
 * Get usage history for an account.
 * Returns usage records for the past N months.
 */
export const getUsageHistory = query({
  args: {
    accountId: v.id("accounts"),
    months: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    const months = args.months ?? 6;
    const records = await ctx.db
      .query("usageRecords")
      .withIndex("by_account_period", (q) => q.eq("accountId", args.accountId))
      .order("desc")
      .take(months);

    return records;
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Increment usage for the current billing period.
 * Called after creating agents, tasks, messages, documents.
 */
export const incrementUsage = mutation({
  args: {
    accountId: v.id("accounts"),
    type: v.union(
      v.literal("agents"),
      v.literal("tasks"),
      v.literal("messages"),
      v.literal("documents"),
    ),
    count: v.optional(v.number()),
    storageBytes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    // Get current period (YYYY-MM)
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const existingRecord = await ctx.db
      .query("usageRecords")
      .withIndex("by_account_period", (q) =>
        q.eq("accountId", args.accountId).eq("period", period),
      )
      .first();

    const count = args.count ?? 1;

    if (!existingRecord) {
      // Create new usage record
      await ctx.db.insert("usageRecords", {
        accountId: args.accountId,
        period,
        agents: args.type === "agents" ? count : 0,
        tasks: args.type === "tasks" ? count : 0,
        messages: args.type === "messages" ? count : 0,
        documents: args.type === "documents" ? count : 0,
        storageBytes: args.storageBytes ?? 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      // Update existing record
      const updates: Record<string, number> = {
        updatedAt: Date.now(),
      };

      if (args.type === "agents") {
        updates.agents = existingRecord.agents + count;
      } else if (args.type === "tasks") {
        updates.tasks = existingRecord.tasks + count;
      } else if (args.type === "messages") {
        updates.messages = existingRecord.messages + count;
      } else if (args.type === "documents") {
        updates.documents = existingRecord.documents + count;
      }

      if (args.storageBytes !== undefined) {
        updates.storageBytes = existingRecord.storageBytes + args.storageBytes;
      }

      await ctx.db.patch(existingRecord._id, updates);
    }

    return true;
  },
});

// ============================================================================
// INTERNAL MUTATIONS (called from webhooks and actions)
// ============================================================================

/**
 * Upsert subscription record from Stripe webhook data.
 * Internal mutation - only called from authenticated webhook handlers.
 */
export const upsertSubscriptionInternal = internalMutation({
  args: {
    accountId: v.id("accounts"),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    stripePriceId: v.string(),
    plan: v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise")),
    status: v.union(
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("incomplete"),
      v.literal("trialing"),
      v.literal("unpaid"),
    ),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.boolean(),
    trialEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existingSubscription = await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_stripe_subscription", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId),
      )
      .first();

    const now = Date.now();

    if (existingSubscription) {
      // Update existing subscription
      await ctx.db.patch(existingSubscription._id, {
        status: args.status,
        stripePriceId: args.stripePriceId,
        plan: args.plan,
        currentPeriodStart: args.currentPeriodStart,
        currentPeriodEnd: args.currentPeriodEnd,
        cancelAtPeriodEnd: args.cancelAtPeriodEnd,
        trialEnd: args.trialEnd,
        updatedAt: now,
      });

      return existingSubscription._id;
    } else {
      // Create new subscription
      const subscriptionId = await ctx.db.insert("billingSubscriptions", {
        accountId: args.accountId,
        stripeCustomerId: args.stripeCustomerId,
        stripeSubscriptionId: args.stripeSubscriptionId,
        stripePriceId: args.stripePriceId,
        plan: args.plan,
        status: args.status,
        currentPeriodStart: args.currentPeriodStart,
        currentPeriodEnd: args.currentPeriodEnd,
        cancelAtPeriodEnd: args.cancelAtPeriodEnd,
        trialEnd: args.trialEnd,
        createdAt: now,
        updatedAt: now,
      });

      return subscriptionId;
    }
  },
});

/**
 * Record invoice from Stripe webhook data.
 * Internal mutation - only called from authenticated webhook handlers.
 */
export const recordInvoiceInternal = internalMutation({
  args: {
    accountId: v.id("accounts"),
    stripeInvoiceId: v.string(),
    stripeCustomerId: v.string(),
    amountDue: v.number(),
    amountPaid: v.number(),
    currency: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("paid"),
      v.literal("void"),
      v.literal("uncollectible"),
    ),
    hostedInvoiceUrl: v.optional(v.string()),
    invoicePdf: v.optional(v.string()),
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const existingInvoice = await ctx.db
      .query("invoices")
      .withIndex("by_stripe_invoice", (q) =>
        q.eq("stripeInvoiceId", args.stripeInvoiceId),
      )
      .first();

    if (existingInvoice) {
      // Update existing invoice
      await ctx.db.patch(existingInvoice._id, {
        status: args.status,
        amountPaid: args.amountPaid,
        hostedInvoiceUrl: args.hostedInvoiceUrl,
        invoicePdf: args.invoicePdf,
      });

      return existingInvoice._id;
    } else {
      // Create new invoice
      const invoiceId = await ctx.db.insert("invoices", {
        accountId: args.accountId,
        stripeInvoiceId: args.stripeInvoiceId,
        stripeCustomerId: args.stripeCustomerId,
        amountDue: args.amountDue,
        amountPaid: args.amountPaid,
        currency: args.currency,
        status: args.status,
        hostedInvoiceUrl: args.hostedInvoiceUrl,
        invoicePdf: args.invoicePdf,
        periodStart: args.periodStart,
        periodEnd: args.periodEnd,
        createdAt: Date.now(),
      });

      return invoiceId;
    }
  },
});

/**
 * Update account plan based on subscription changes.
 * Syncs the account.plan field with the subscription plan.
 */
export const updateAccountPlanInternal = internalMutation({
  args: {
    accountId: v.id("accounts"),
    plan: v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.accountId, {
      plan: args.plan,
    });

    return args.accountId;
  },
});

// ============================================================================
// ACTIONS (Stripe API calls)
// ============================================================================

/**
 * Map Stripe price ID to a plan tier.
 */
function getPlanFromPriceId(priceId: string): "free" | "pro" | "enterprise" {
  const proPrice =
    process.env.STRIPE_PRICE_PRO ?? process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO;
  const enterprisePrice =
    process.env.STRIPE_PRICE_ENTERPRISE ??
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE;

  if (priceId === proPrice) {
    return "pro";
  }
  if (priceId === enterprisePrice) {
    return "enterprise";
  }
  return "free";
}

/**
 * Handle Stripe webhook events inside Convex.
 * Validates webhook signature and updates billing records.
 */
export const handleStripeWebhook = action({
  args: {
    payload: v.string(),
    signature: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const proPriceId =
      process.env.STRIPE_PRICE_PRO ?? process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO;

    if (!stripeSecretKey) {
      throw new Error(
        "STRIPE_SECRET_KEY is not configured in environment variables",
      );
    }
    if (!webhookSecret) {
      throw new Error(
        "STRIPE_WEBHOOK_SECRET is not configured in environment variables",
      );
    }
    if (!proPriceId) {
      throw new Error(
        "STRIPE_PRICE_PRO is not configured in environment variables",
      );
    }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-12-18.acacia",
    });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        args.payload,
        args.signature,
        webhookSecret,
      );
    } catch (error) {
      throw new Error("Invalid Stripe webhook signature");
    }

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const priceId = subscription.items.data[0]?.price.id;
        if (!priceId) {
          throw new Error("Missing price in subscription");
        }

        let accountId = subscription.metadata.accountId;
        if (!accountId && typeof subscription.customer === "string") {
          const customer = await stripe.customers.retrieve(
            subscription.customer,
          );
          if ("metadata" in customer) {
            accountId = customer.metadata?.accountId;
          }
        }

        if (!accountId) {
          throw new Error("Missing accountId in subscription metadata");
        }

        const plan = getPlanFromPriceId(priceId);
        const status =
          subscription.status === "active" ||
          subscription.status === "trialing" ||
          subscription.status === "past_due" ||
          subscription.status === "incomplete" ||
          subscription.status === "unpaid"
            ? subscription.status
            : "canceled";

        await ctx.runMutation(internal.billing.upsertSubscriptionInternal, {
          accountId: accountId as any,
          stripeCustomerId: subscription.customer as string,
          stripeSubscriptionId: subscription.id,
          stripePriceId: priceId,
          plan,
          status,
          currentPeriodStart: subscription.current_period_start * 1000,
          currentPeriodEnd: subscription.current_period_end * 1000,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          trialEnd: subscription.trial_end
            ? subscription.trial_end * 1000
            : undefined,
        });

        await ctx.runMutation(internal.billing.updateAccountPlanInternal, {
          accountId: accountId as any,
          plan,
        });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        let accountId = subscription.metadata.accountId;
        if (!accountId && typeof subscription.customer === "string") {
          const customer = await stripe.customers.retrieve(
            subscription.customer,
          );
          if ("metadata" in customer) {
            accountId = customer.metadata?.accountId;
          }
        }

        if (!accountId) {
          throw new Error("Missing accountId in subscription metadata");
        }

        await ctx.runMutation(internal.billing.updateAccountPlanInternal, {
          accountId: accountId as any,
          plan: "free",
        });

        const priceId = subscription.items.data[0]?.price.id || "";
        await ctx.runMutation(internal.billing.upsertSubscriptionInternal, {
          accountId: accountId as any,
          stripeCustomerId: subscription.customer as string,
          stripeSubscriptionId: subscription.id,
          stripePriceId: priceId,
          plan: "free",
          status: "canceled",
          currentPeriodStart: subscription.current_period_start * 1000,
          currentPeriodEnd: subscription.current_period_end * 1000,
          cancelAtPeriodEnd: true,
          trialEnd: undefined,
        });
        break;
      }

      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription;
        if (typeof subscriptionId !== "string") {
          return;
        }

        const fullSubscription =
          await stripe.subscriptions.retrieve(subscriptionId);
        let accountId = fullSubscription.metadata.accountId;
        if (!accountId && typeof fullSubscription.customer === "string") {
          const customer = await stripe.customers.retrieve(
            fullSubscription.customer,
          );
          if ("metadata" in customer) {
            accountId = customer.metadata?.accountId;
          }
        }

        if (!accountId) {
          throw new Error(
            "Missing accountId in subscription metadata for invoice",
          );
        }

        const status = invoice.status === "paid" ? "paid" : "open";

        await ctx.runMutation(internal.billing.recordInvoiceInternal, {
          accountId: accountId as any,
          stripeInvoiceId: invoice.id,
          stripeCustomerId: invoice.customer as string,
          amountDue: invoice.amount_due,
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
          status,
          hostedInvoiceUrl: invoice.hosted_invoice_url || undefined,
          invoicePdf: invoice.invoice_pdf || undefined,
          periodStart: invoice.period_start * 1000,
          periodEnd: invoice.period_end * 1000,
        });
        break;
      }

      default:
        break;
    }
  },
});

/**
 * Create a Stripe Checkout session for upgrading to a paid plan.
 * Returns the checkout session URL to redirect the user.
 */
export const createCheckoutSession = action({
  args: {
    accountId: v.id("accounts"),
    priceId: v.string(),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    // Verify account membership
    await ctx.runQuery(api.accounts.getByIdOrThrow, {
      accountId: args.accountId,
    });

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error(
        "STRIPE_SECRET_KEY is not configured in environment variables",
      );
    }

    // Initialize Stripe (lazy import to avoid bundling in client)
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-12-18.acacia",
    });

    // Get or create Stripe customer for this account
    const account = await ctx.runQuery(api.accounts.getByIdOrThrow, {
      accountId: args.accountId,
    });
    let customerId: string;

    // Check if subscription already exists
    const existingSubscription = await ctx.runQuery(
      api.billing.getSubscription,
      {
        accountId: args.accountId,
      },
    );

    if (existingSubscription) {
      customerId = existingSubscription.stripeCustomerId;
    } else {
      // Create new customer
      const customer = await stripe.customers.create({
        metadata: {
          accountId: args.accountId,
          accountSlug: account.slug,
        },
      });
      customerId = customer.id;
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: args.priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: {
          accountId: args.accountId,
        },
      },
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      metadata: {
        accountId: args.accountId,
      },
    });

    if (!session.url) {
      throw new Error("Failed to create checkout session URL");
    }

    return session.url;
  },
});

/**
 * Create a Stripe Customer Portal session.
 * Returns the portal URL to redirect the user for managing their subscription.
 */
export const createCustomerPortalSession = action({
  args: {
    accountId: v.id("accounts"),
    returnUrl: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    // Verify account membership
    await ctx.runQuery(api.accounts.getByIdOrThrow, {
      accountId: args.accountId,
    });

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error(
        "STRIPE_SECRET_KEY is not configured in environment variables",
      );
    }

    // Get subscription to retrieve Stripe customer ID
    const subscription = await ctx.runQuery(api.billing.getSubscription, {
      accountId: args.accountId,
    });

    if (!subscription) {
      throw new Error("No active subscription found for this account");
    }

    // Initialize Stripe
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-12-18.acacia",
    });

    // Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: args.returnUrl,
    });

    return session.url;
  },
});
