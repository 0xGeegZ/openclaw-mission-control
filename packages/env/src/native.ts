/**
 * Expo / React Native env validation. Import in apps/native when the native app is built.
 * Uses env-core (framework-agnostic); EXPO_PUBLIC_* vars are available in the app.
 */

import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "EXPO_PUBLIC_",
  client: {
    EXPO_PUBLIC_CONVEX_URL: z.string().url(),
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  },
  runtimeEnv: process.env,
});
