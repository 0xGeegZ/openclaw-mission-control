"use client";

import { useRouter } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@packages/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@packages/ui/components/dropdown-menu";

interface AccountSwitcherProps {
  currentSlug: string;
}

/**
 * Dropdown to switch between accounts.
 * Skips the query until Convex has validated the auth token to avoid unauthenticated errors on load.
 */
export function AccountSwitcher({ currentSlug }: AccountSwitcherProps) {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const accounts = useQuery(
    api.accounts.listMyAccounts,
    isAuthenticated ? {} : "skip"
  );
  
  if (!accounts) {
    return (
      <Button variant="outline" className="w-full justify-between" disabled>
        <span className="truncate">Loading...</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    );
  }
  
  const currentAccount = accounts.find(a => a && a.slug === currentSlug);
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <span className="truncate">{currentAccount?.name ?? "Select account"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        {accounts
          .filter((account): account is NonNullable<typeof account> => account !== null)
          .map((account) => (
            <DropdownMenuItem
              key={account._id}
              onClick={() => router.push(`/${account.slug}/tasks`)}
              className="flex items-center justify-between"
            >
              <span className="truncate">{account.name}</span>
              {account.slug === currentSlug && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </DropdownMenuItem>
          ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/new-account")}>
          <Plus className="mr-2 h-4 w-4" />
          Create Account
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
