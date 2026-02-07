import { NextRequest, NextResponse } from "next/server";
import { api } from "@packages/backend/convex/_generated/api";
import { env } from "@packages/env/nextjs-server";
import { ConvexHttpClient } from "convex/browser";

/**
 * Stripe Webhook Handler
 *
 * Processes Stripe events for subscription and invoice management.
 * Event validation and persistence are handled in Convex.
 */

const convexUrl = env.NEXT_PUBLIC_CONVEX_URL;

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      console.error("[Stripe Webhook] Missing stripe-signature header");
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 },
      );
    }

    if (!convexUrl) {
      console.error("[Stripe Webhook] NEXT_PUBLIC_CONVEX_URL not configured");
      return NextResponse.json(
        { error: "Convex URL not configured" },
        { status: 500 },
      );
    }

    const convex = new ConvexHttpClient(convexUrl);
    await convex.action(api.billing.handleStripeWebhook, {
      payload: body,
      signature,
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Stripe Webhook] Error processing webhook:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
