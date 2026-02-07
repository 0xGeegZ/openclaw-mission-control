"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Button } from "@packages/ui/components/button";
import Link from "next/link";
import { FileQuestion } from "lucide-react";

interface DocumentRedirectProps {
  documentId: string;
}

/**
 * Resolves document by ID, then redirects to /[accountSlug]/docs/[documentId].
 * Used for /docs/[id] and /document/[id] so links without account slug still work.
 */
function DocumentRedirectContent({ documentId }: DocumentRedirectProps) {
  const router = useRouter();
  const result = useQuery(
    api.documents.getAccountSlugForRedirect,
    documentId ? { documentId: documentId as Id<"documents"> } : "skip",
  );

  useEffect(() => {
    if (result?.accountSlug) {
      router.replace(`/${result.accountSlug}/docs/${documentId}`);
    }
  }, [result, documentId, router]);

  if (result === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (result === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <FileQuestion className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-semibold">Document not found</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          This document may have been deleted or you don&apos;t have permission
          to view it.
        </p>
        <Button asChild variant="outline">
          <Link href="/dashboard">Go to Dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Redirecting...</p>
    </div>
  );
}

/** Wraps redirect with auth: unauthenticated users see a sign-in prompt or redirect. */
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

export function DocumentRedirect({ documentId }: DocumentRedirectProps) {
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
        <DocumentRedirectContent documentId={documentId} />
      </Authenticated>
    </>
  );
}
