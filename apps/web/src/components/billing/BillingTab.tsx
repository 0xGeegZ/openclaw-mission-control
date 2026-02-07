"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useAction } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { env } from "@packages/env/nextjs-client";
import { PLAN_PRICING } from "@packages/shared/types/billing";
import { PlanCard } from "./PlanCard";
import { SubscriptionCard } from "./SubscriptionCard";
import { UsageCard } from "./UsageCard";
import { InvoiceList } from "./InvoiceList";
import { Skeleton } from "@packages/ui/components/skeleton";
import { toast } from "sonner";

interface BillingTabProps {
  accountId: Id<"accounts">;
  accountSlug: string;
}

/**
 * BillingTab component for the settings page.
 * Shows subscription, plans, usage, and invoices.
 */
export function BillingTab({ accountId, accountSlug }: BillingTabProps) {
  const router = useRouter();
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isManaging, setIsManaging] = useState(false);

  // Queries
  const subscription = useQuery(api.billing.getSubscription, { accountId });
  const usage = useQuery(api.billing.getCurrentUsage, { accountId });
  const invoices = useQuery(api.billing.listInvoices, { accountId, limit: 20 });
  const account = useQuery(api.accounts.getByIdOrThrow, { accountId });

  // Actions
  const createCheckoutSession = useAction(api.billing.createCheckoutSession);
  const createCustomerPortalSession = useAction(
    api.billing.createCustomerPortalSession,
  );

  const currentPlan = account?.plan || "free";
  const isLoading =
    subscription === undefined || usage === undefined || invoices === undefined;

  const handleUpgrade = async (planName: string) => {
    const plan = planName.toLowerCase() as "free" | "pro" | "enterprise";

    // Enterprise requires contacting sales
    if (plan === "enterprise") {
      toast.info("Contact sales for enterprise pricing", {
        description: "Email us at sales@example.com for a custom quote.",
      });
      return;
    }

    // Get price ID from environment
    const priceId =
      plan === "pro" ? env.NEXT_PUBLIC_STRIPE_PRICE_PRO : undefined;

    if (!priceId) {
      toast.error("Plan pricing not configured", {
        description: "Please contact support to configure pricing.",
      });
      return;
    }

    setIsUpgrading(true);
    try {
      const successUrl = `${window.location.origin}/${accountSlug}/settings?tab=billing&success=true`;
      const cancelUrl = `${window.location.origin}/${accountSlug}/settings?tab=billing`;

      const checkoutUrl = await createCheckoutSession({
        accountId,
        priceId,
        successUrl,
        cancelUrl,
      });

      // Redirect to Stripe Checkout
      router.push(checkoutUrl);
    } catch (error) {
      console.error("Failed to create checkout session:", error);
      toast.error("Failed to start checkout", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleManageSubscription = async () => {
    setIsManaging(true);
    try {
      const returnUrl = `${window.location.origin}/${accountSlug}/settings?tab=billing`;

      const portalUrl = await createCustomerPortalSession({
        accountId,
        returnUrl,
      });

      // Redirect to Stripe Customer Portal
      router.push(portalUrl);
    } catch (error) {
      console.error("Failed to create customer portal session:", error);
      toast.error("Failed to open subscription management", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsManaging(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full" />
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const subscriptionSummary = subscription
    ? {
        plan: currentPlan,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        trialEnd: subscription.trialEnd,
      }
    : {
        plan: "free" as const,
        status: "active" as const,
        currentPeriodEnd: Date.now(),
        cancelAtPeriodEnd: false,
      };

  const invoiceSummaries = invoices.map((inv) => ({
    id: inv.stripeInvoiceId,
    date: inv.createdAt,
    amountDue: inv.amountDue,
    amountPaid: inv.amountPaid,
    currency: inv.currency,
    status: inv.status,
    hostedInvoiceUrl: inv.hostedInvoiceUrl,
    invoicePdf: inv.invoicePdf,
  }));

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Current Subscription & Usage */}
      <div className="grid gap-6 md:grid-cols-2">
        <SubscriptionCard
          subscription={subscriptionSummary}
          onManageSubscription={handleManageSubscription}
          isLoading={isManaging}
        />
        <UsageCard usage={usage} plan={currentPlan} />
      </div>

      {/* Available Plans */}
      <div>
        <div className="mb-6">
          <h3 className="text-xl font-semibold tracking-tight">
            Available Plans
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Choose the plan that fits your needs
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {Object.entries(PLAN_PRICING).map(([key, plan]) => (
            <PlanCard
              key={key}
              plan={plan}
              currentPlan={currentPlan}
              onUpgrade={() => handleUpgrade(plan.name)}
              isLoading={isUpgrading}
            />
          ))}
        </div>
      </div>

      {/* Invoice History */}
      <InvoiceList invoices={invoiceSummaries} />
    </div>
  );
}
