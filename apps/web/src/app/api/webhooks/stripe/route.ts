import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { api } from "@packages/backend/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";

/**
 * Stripe Webhook Handler
 *
 * Processes Stripe events for subscription and invoice management.
 * Events handled:
 * - customer.subscription.created
 * - customer.subscription.updated
 * - customer.subscription.deleted
 * - invoice.payment_succeeded
 * - invoice.payment_failed
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia",
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL!;

// Helper to map Stripe price ID to plan tier
function getPlanFromPriceId(priceId: string): "free" | "pro" | "enterprise" {
  // These mappings should match your Stripe price IDs
  // TODO: Configure these in environment variables or shared constants
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO) {
    return "pro";
  }
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE) {
    return "enterprise";
  }
  return "free";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      console.error("[Stripe Webhook] Missing stripe-signature header");
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 }
      );
    }

    if (!webhookSecret) {
      console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured");
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error(`[Stripe Webhook] Signature verification failed:`, err);
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 }
      );
    }

    console.log(`[Stripe Webhook] Received event: ${event.type}`);

    const convex = new ConvexHttpClient(convexUrl);

    // Process different event types
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const accountId = subscription.metadata.accountId;

        if (!accountId) {
          console.error(
            `[Stripe Webhook] No accountId in subscription metadata: ${subscription.id}`
          );
          return NextResponse.json(
            { error: "Missing accountId in metadata" },
            { status: 400 }
          );
        }

        const priceId = subscription.items.data[0]?.price.id;
        if (!priceId) {
          console.error(
            `[Stripe Webhook] No price found for subscription: ${subscription.id}`
          );
          return NextResponse.json(
            { error: "Missing price in subscription" },
            { status: 400 }
          );
        }

        const plan = getPlanFromPriceId(priceId);

        // Map Stripe status to our status
        const status =
          subscription.status === "active" ||
          subscription.status === "trialing" ||
          subscription.status === "past_due" ||
          subscription.status === "incomplete" ||
          subscription.status === "unpaid"
            ? subscription.status
            : "canceled";

        // Update subscription in Convex
        await convex.mutation(api.billing.upsertSubscriptionInternal, {
          accountId: accountId as any, // Type cast needed for ID
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

        // Update account plan
        await convex.mutation(api.billing.updateAccountPlanInternal, {
          accountId: accountId as any,
          plan,
        });

        console.log(
          `[Stripe Webhook] Updated subscription for account ${accountId}: ${plan}`
        );
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const accountId = subscription.metadata.accountId;

        if (!accountId) {
          console.error(
            `[Stripe Webhook] No accountId in subscription metadata: ${subscription.id}`
          );
          return NextResponse.json(
            { error: "Missing accountId in metadata" },
            { status: 400 }
          );
        }

        // Downgrade to free plan
        await convex.mutation(api.billing.updateAccountPlanInternal, {
          accountId: accountId as any,
          plan: "free",
        });

        // Update subscription status to canceled
        const priceId = subscription.items.data[0]?.price.id || "";
        await convex.mutation(api.billing.upsertSubscriptionInternal, {
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

        console.log(
          `[Stripe Webhook] Subscription canceled for account ${accountId}`
        );
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscription = invoice.subscription;

        if (typeof subscription !== "string") {
          console.log(
            `[Stripe Webhook] Invoice not linked to subscription: ${invoice.id}`
          );
          break;
        }

        // Retrieve subscription to get accountId from metadata
        const fullSubscription = await stripe.subscriptions.retrieve(
          subscription
        );
        const accountId = fullSubscription.metadata.accountId;

        if (!accountId) {
          console.error(
            `[Stripe Webhook] No accountId in subscription metadata for invoice: ${invoice.id}`
          );
          break;
        }

        // Record invoice in Convex
        await convex.mutation(api.billing.recordInvoiceInternal, {
          accountId: accountId as any,
          stripeInvoiceId: invoice.id,
          stripeCustomerId: invoice.customer as string,
          amountDue: invoice.amount_due,
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
          status: invoice.status === "paid" ? "paid" : "open",
          hostedInvoiceUrl: invoice.hosted_invoice_url || undefined,
          invoicePdf: invoice.invoice_pdf || undefined,
          periodStart: invoice.period_start * 1000,
          periodEnd: invoice.period_end * 1000,
        });

        console.log(
          `[Stripe Webhook] Recorded invoice for account ${accountId}: ${invoice.id}`
        );
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscription = invoice.subscription;

        if (typeof subscription !== "string") {
          console.log(
            `[Stripe Webhook] Invoice not linked to subscription: ${invoice.id}`
          );
          break;
        }

        // Retrieve subscription to get accountId
        const fullSubscription = await stripe.subscriptions.retrieve(
          subscription
        );
        const accountId = fullSubscription.metadata.accountId;

        if (!accountId) {
          console.error(
            `[Stripe Webhook] No accountId in subscription metadata for invoice: ${invoice.id}`
          );
          break;
        }

        // Record failed invoice
        await convex.mutation(api.billing.recordInvoiceInternal, {
          accountId: accountId as any,
          stripeInvoiceId: invoice.id,
          stripeCustomerId: invoice.customer as string,
          amountDue: invoice.amount_due,
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
          status: "open", // Failed payment keeps invoice open
          hostedInvoiceUrl: invoice.hosted_invoice_url || undefined,
          invoicePdf: invoice.invoice_pdf || undefined,
          periodStart: invoice.period_start * 1000,
          periodEnd: invoice.period_end * 1000,
        });

        console.warn(
          `[Stripe Webhook] Payment failed for account ${accountId}: ${invoice.id}`
        );
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Stripe Webhook] Error processing webhook:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
