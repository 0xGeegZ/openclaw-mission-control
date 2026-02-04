"use client";

import { useRouter } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Check, ChevronsUpDown, Plus, Building2 } from "lucide-react";
import { Button } from "@packages/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@packages/ui/components/dropdown-menu";
import { cn } from "@packages/ui/lib/utils";

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
      <Button variant="outline" className="w-full justify-between h-11 rounded-xl" disabled>
        <span className="truncate text-muted-foreground">Loading...</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    );
  }
  
  const currentAccount = accounts.find(a => a && a.slug === currentSlug);
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          className="w-full justify-between h-11 rounded-xl border-border/60 hover:border-primary/30 hover:bg-primary/5 transition-all duration-200"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center justify-center h-6 w-6 rounded-lg bg-primary/10 shrink-0">
              <Building2 className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="truncate font-medium">{currentAccount?.name ?? "Select account"}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground/50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-xl" align="start">
        {accounts
          .filter((account): account is NonNullable<typeof account> => account !== null)
          .map((account) => (
            <DropdownMenuItem
              key={account._id}
              onClick={() => router.push(`/${account.slug}/tasks`)}
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg cursor-pointer",
                account.slug === currentSlug && "bg-primary/5"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={cn(
                  "flex items-center justify-center h-6 w-6 rounded-lg shrink-0",
                  account.slug === currentSlug ? "bg-primary/15" : "bg-muted"
                )}>
                  <Building2 className={cn(
                    "h-3.5 w-3.5",
                    account.slug === currentSlug ? "text-primary" : "text-muted-foreground"
                  )} />
                </div>
                <span className="truncate">{account.name}</span>
              </div>
              {account.slug === currentSlug && (
                <Check className="h-4 w-4 text-primary shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={() => router.push("/new-account")}
          className="rounded-lg cursor-pointer text-primary hover:text-primary"
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Account
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
