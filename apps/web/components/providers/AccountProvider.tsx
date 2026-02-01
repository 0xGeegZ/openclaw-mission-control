"use client";

import { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { AccountContext } from "@/lib/hooks/useAccount";

interface AccountProviderProps {
  accountSlug: string;
  children: ReactNode;
}

/**
 * Provides account context to dashboard pages.
 */
export function AccountProvider({ accountSlug, children }: AccountProviderProps) {
  const account = useQuery(api.accounts.getBySlug, { slug: accountSlug });
  
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
