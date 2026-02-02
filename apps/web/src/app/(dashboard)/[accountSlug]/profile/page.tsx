"use client";

import { use } from "react";
import Link from "next/link";
import { useUser, UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@packages/ui/components/card";
import { Skeleton } from "@packages/ui/components/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@packages/ui/components/avatar";
import { Building2, Mail, User } from "lucide-react";

interface ProfilePageProps {
  params: Promise<{ accountSlug: string }>;
}

/**
 * User profile: Clerk identity and list of workspaces (accounts).
 */
export default function ProfilePage({ params }: ProfilePageProps) {
  const { accountSlug } = use(params);
  const { user } = useUser();
  const accounts = useQuery(
    api.accounts.listMyAccounts,
    user ? {} : "skip"
  );

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b bg-card">
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your identity and workspaces
        </p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" />
                Account
              </CardTitle>
              <CardDescription>Signed in with Clerk</CardDescription>
            </CardHeader>
            <CardContent className="flex items-start gap-4">
              {!user ? (
                <Skeleton className="h-16 w-16 rounded-full shrink-0" />
              ) : (
                <Avatar className="h-16 w-16">
                  <AvatarImage src={user.imageUrl} alt={user.fullName ?? undefined} />
                  <AvatarFallback className="text-lg">
                    {user.firstName?.[0] ?? user.emailAddresses[0]?.emailAddress?.[0] ?? "?"}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                {user ? (
                  <>
                    <p className="font-semibold truncate">
                      {user.fullName ?? user.primaryEmailAddress?.emailAddress ?? "User"}
                    </p>
                    {user.primaryEmailAddress && (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{user.primaryEmailAddress.emailAddress}</span>
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Manage your account in Clerk (sign out, security, etc.) via the user menu in the sidebar.
                    </p>
                  </>
                ) : (
                  <Skeleton className="h-6 w-48" />
                )}
              </div>
              <UserButton
                afterSignOutUrl="/"
                appearance={{
                  elements: { avatarBox: "h-10 w-10" },
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Workspaces
              </CardTitle>
              <CardDescription>Accounts you belong to</CardDescription>
            </CardHeader>
            <CardContent>
              {accounts === undefined ? (
                <ul className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <li key={i}>
                      <Skeleton className="h-10 w-full" />
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="space-y-2">
                  {accounts
                    .filter((a): a is NonNullable<typeof a> => a !== null)
                    .map((account) => (
                      <li key={account._id}>
                        <Link
                          href={`/${account.slug}/tasks`}
                          className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                        >
                          <span className="font-medium truncate">{account.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0 ml-2">
                            {account.slug === accountSlug ? "Current" : "Switch"}
                          </span>
                        </Link>
                      </li>
                    ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
