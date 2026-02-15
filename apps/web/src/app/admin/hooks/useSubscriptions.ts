import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export interface Subscription {
  id?: Id<"billingSubscriptions">;
  accountId: Id<"accounts">;
  plan: "free" | "pro" | "enterprise";
  status: "active" | "cancelled" | "past_due";
  currentPeriodStart: number;
  currentPeriodEnd: number;
  autoRenew: boolean;
  customerId?: string;
  subscriptionId?: string;
  quotas: {
    containers: number;
    messages: number;
    apiCalls: number;
    agents: number;
  };
}

export interface Invoice {
  id: Id<"invoices">;
  invoiceNumber: string;
  amount: number;
  currency: string;
  status: string;
  issuedAt: number;
  dueAt: number;
  paidAt?: number;
}

/**
 * Get the current subscription for an account.
 */
export const useSubscription = (accountId: Id<"accounts">) => {
  const result = useQuery(api.admin_billing.get_subscription, {
    accountId,
  });

  return {
    subscription: result as Subscription | undefined,
    loading: result === undefined,
    error: result === null ? new Error("Failed to fetch subscription") : undefined,
  };
};

/**
 * List all subscriptions (for admin overview).
 */
export const useSubscriptions = (accountId: Id<"accounts">) => {
  const result = useQuery(api.admin_billing.list_subscriptions, {
    accountId,
    limit: 50,
  });

  return {
    subscriptions: result?.subscriptions ?? [],
    loading: result === undefined,
    error: result === null ? new Error("Failed to fetch subscriptions") : undefined,
  };
};

/**
 * Update a subscription plan.
 */
export const useUpdateSubscription = (accountId: Id<"accounts">) => {
  const mutation = useMutation(api.admin_billing.update_subscription);

  return {
    updateSubscription: async (
      customerId: Id<"accounts">,
      newPlan: "free" | "pro" | "enterprise"
    ) => {
      await mutation({
        accountId,
        customerId,
        newPlan,
      });
    },
    loading: mutation.isLoading,
    error: mutation.error,
  };
};

/**
 * Cancel a subscription.
 */
export const useCancelSubscription = (accountId: Id<"accounts">) => {
  const mutation = useMutation(api.admin_billing.cancel_subscription);

  return {
    cancelSubscription: async (customerId: Id<"accounts">, reason?: string) => {
      await mutation({
        accountId,
        customerId,
        reason,
      });
    },
    loading: mutation.isLoading,
    error: mutation.error,
  };
};

/**
 * Get invoices for a customer.
 */
export const useInvoices = (
  accountId: Id<"accounts">,
  customerId: Id<"accounts">
) => {
  const result = useQuery(api.admin_billing.get_invoices, {
    accountId,
    customerId,
    limit: 12,
  });

  return {
    invoices: result?.invoices ?? [],
    loading: result === undefined,
    error: result === null ? new Error("Failed to fetch invoices") : undefined,
  };
};
