"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

/**
 * Gate page: redirects authenticated users to their first account or to create one.
 * Single redirect—no intermediate /new-account when user already has accounts.
 */
function DashboardGateContent() {
  const router = useRouter();
  const myAccounts = useQuery(api.accounts.listMyAccounts);

  useEffect(() => {
    if (myAccounts === undefined) return;
    if (myAccounts.length > 0) {
      const first = myAccounts[0];
      if (first?.slug) {
        router.replace(`/${first.slug}/tasks`);
      } else {
        router.replace("/new-account");
      }
    } else {
      router.replace("/new-account");
    }
  }, [myAccounts, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Loading...</p>
    </div>
  );
}

/** Redirects to sign-in when Convex has no auth (e.g. Clerk not yet synced). */
function RedirectToSignIn() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/sign-in");
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Redirecting to sign in...</p>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <>
      <AuthLoading>
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </AuthLoading>
      <Unauthenticated>
        <RedirectToSignIn />
      </Unauthenticated>
      <Authenticated>
        <DashboardGateContent />
      </Authenticated>
    </>
  );
}
