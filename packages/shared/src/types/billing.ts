/**
 * Billing & Subscription Types
 *
 * Shared types for billing, subscriptions, and plan management.
 */

/**
 * Subscription plan tiers
 */
export type PlanTier = "free" | "pro" | "enterprise";

/**
 * Subscription status (from Stripe)
 */
export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "trialing"
  | "unpaid";

/**
 * Invoice status (from Stripe)
 */
export type InvoiceStatus =
  | "draft"
  | "open"
  | "paid"
  | "void"
  | "uncollectible";

/**
 * Plan feature matrix for display
 */
export interface PlanFeatures {
  name: string;
  price: string;
  priceId?: string;
  features: string[];
  highlighted?: boolean;
  ctaText: string;
}

/**
 * Plan pricing definitions
 */
export const PLAN_PRICING: Record<PlanTier, PlanFeatures> = {
  free: {
    name: "Free",
    price: "$0",
    features: [
      "1 AI agent",
      "10 tasks per month",
      "5 documents per task",
      "1 GB storage",
      "Up to 3 team members",
      "Basic support",
    ],
    ctaText: "Current Plan",
  },
  pro: {
    name: "Pro",
    price: "$49",
    features: [
      "5 AI agents",
      "Unlimited tasks",
      "20 documents per task",
      "10 GB storage",
      "Up to 10 team members",
      "Priority support",
      "Email notifications",
    ],
    highlighted: true,
    ctaText: "Upgrade to Pro",
  },
  enterprise: {
    name: "Enterprise",
    price: "Custom",
    features: [
      "Unlimited AI agents",
      "Unlimited tasks",
      "Unlimited documents",
      "100 GB storage",
      "Unlimited team members",
      "Dedicated support",
      "Custom integrations",
      "SLA guarantee",
    ],
    ctaText: "Contact Sales",
  },
};

/**
 * Usage metrics for billing dashboard
 */
export interface UsageMetrics {
  period: string; // YYYY-MM
  agents: number;
  tasks: number;
  messages: number;
  documents: number;
  storageBytes: number;
}

/**
 * Subscription summary for UI display
 */
export interface SubscriptionSummary {
  plan: PlanTier;
  status: SubscriptionStatus;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  trialEnd?: number;
}

/**
 * Invoice summary for billing history
 */
export interface InvoiceSummary {
  id: string;
  date: number;
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: InvoiceStatus;
  hostedInvoiceUrl?: string;
  invoicePdf?: string;
}
