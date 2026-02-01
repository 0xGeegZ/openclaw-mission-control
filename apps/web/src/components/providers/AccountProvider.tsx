"use client";

import { ReactNode } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { AccountContext } from "@/lib/hooks/useAccount";

interface AccountProviderProps {
  accountSlug: string;
  children: ReactNode;
}

/**
 * Provides account context to dashboard pages.
 * Skips the account query until Convex has validated the auth token to avoid
 * "Unauthenticated: No valid identity found" on initial load / refresh.
 */
export function AccountProvider({ accountSlug, children }: AccountProviderProps) {
  const { isAuthenticated } = useConvexAuth();
  const account = useQuery(
    api.accounts.getBySlug,
    isAuthenticated ? { slug: accountSlug } : "skip"
  );
  
  const value = {
    account: account ?? null,
    accountId: account?._id ?? null,
    isLoading: account === undefined,
  };
  
  return (
    <AccountContext.Provider value={value}>
      {children}
    </AccountContext.Provider>
  );
}
