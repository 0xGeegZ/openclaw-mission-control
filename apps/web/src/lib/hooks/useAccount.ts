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
  membership: Doc<"memberships"> | null;
  isAdmin: boolean;
  isOwner: boolean;
}

export const AccountContext = createContext<AccountContextValue>({
  account: null,
  accountId: null,
  isLoading: true,
  membership: null,
  isAdmin: false,
  isOwner: false,
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
 * Hook to require current account; throws if not loaded or no account.
 * Use in components that must run only when account context is ready.
 */
export function useRequireAccount(): {
  account: Doc<"accounts">;
  accountId: Id<"accounts">;
  isAdmin: boolean;
  isOwner: boolean;
} {
  const { account, accountId, isLoading, isAdmin, isOwner } = useAccount();

  if (isLoading) {
    throw new Error("useRequireAccount: account is still loading");
  }

  if (!account || !accountId) {
    throw new Error("useRequireAccount: no account selected or access denied");
  }

  return { account, accountId, isAdmin, isOwner };
}
