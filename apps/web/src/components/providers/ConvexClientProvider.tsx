"use client";

import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";
import { ReactNode } from "react";

import { env } from "@packages/env/nextjs-client";

const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL);

/**
 * Convex client provider with Clerk auth for the Next.js app.
 * Must be wrapped by ClerkProvider. Provides Convex context and syncs Clerk auth to Convex.
 */
export default function ConvexClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
