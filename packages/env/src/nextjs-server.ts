/**
 * Next.js server-side env validation. Import only in server code (API routes, server components).
 * Used by apps/web for CLERK_SECRET_KEY and other server-only vars.
 */

import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    CLERK_SECRET_KEY: z.string().min(1),
    NEXT_PUBLIC_CONVEX_URL: z.string().url().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_PRO: z.string().optional(),
    STRIPE_PRICE_ENTERPRISE: z.string().optional(),
  },
  experimental__runtimeEnv: process.env,
});
