/**
 * Next.js server-side env validation. Import only in server code (API routes, server components).
 * Used by apps/web for CLERK_SECRET_KEY and other server-only vars.
 */

import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    CLERK_SECRET_KEY: z.string().min(1),
  },
  experimental__runtimeEnv: process.env,
});
