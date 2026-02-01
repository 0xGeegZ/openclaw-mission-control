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
  
  // Fetch user's membership to determine role
  const membership = useQuery(
    api.memberships.getMyMembership,
    isAuthenticated && account?._id ? { accountId: account._id } : "skip"
  );
  
  const isAdmin = membership?.role === "admin" || membership?.role === "owner";
  const isOwner = membership?.role === "owner";
  
  const value = {
    account: account ?? null,
    accountId: account?._id ?? null,
    isLoading: account === undefined,
    membership: membership ?? null,
    isAdmin,
    isOwner,
  };
  
  return (
    <AccountContext.Provider value={value}>
      {children}
    </AccountContext.Provider>
  );
}
