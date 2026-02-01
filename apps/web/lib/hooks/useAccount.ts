"use client";

import { createContext, useContext } from "react";
import { Doc, Id } from "@packages/backend/convex/_generated/dataModel";

/**
 * Account context for dashboard pages.
 */
export interface AccountContextValue {
  account: Doc<"accounts"> | null;
  accountId: Id<"accounts"> | null;
  isLoading: boolean;
}

export const AccountContext = createContext<AccountContextValue>({
  account: null,
  accountId: null,
  isLoading: true,
});

/**
 * Hook to access current account context.
 * Must be used within AccountProvider.
 */
export function useAccount(): AccountContextValue {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error("useAccount must be used within AccountProvider");
  }
  return context;
}

/**
 * Hook to require account (throws if not loaded).
 */
export function useRequireAccount(): { 
  account: Doc<"accounts">; 
  accountId: Id<"accounts">;
} {
  const { account, accountId, isLoading } = useAccount();
  
  if (isLoading) {
    throw new Error("Account is still loading");
  }
  
  if (!account || !accountId) {
    throw new Error("No account selected");
  }
  
  return { account, accountId };
}
