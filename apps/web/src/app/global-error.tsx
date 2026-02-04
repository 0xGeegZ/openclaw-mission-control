"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

/**
 * Root-level error UI when the app tree fails. Replaces the root layout.
 * Kept minimal and self-contained so it can render even when the rest of the app is broken.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-background">
          <div className="relative mb-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-destructive/10">
              <AlertTriangle
                className="h-10 w-10 text-destructive"
                aria-hidden
              />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-foreground">
            Application Error
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-md leading-relaxed">
            A critical error occurred. Please try refreshing the page or return
            to the home page.
          </p>

          <div className="flex items-center gap-3 mt-6">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Home className="h-4 w-4 mr-2" aria-hidden />
              Go Home
            </Link>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              aria-label="Try again"
            >
              <RefreshCw className="h-4 w-4 mr-2" aria-hidden />
              Try Again
            </button>
          </div>

          {error.digest && (
            <p className="mt-6 text-xs text-muted-foreground">
              Error ID:{" "}
              <code className="px-1.5 py-0.5 rounded bg-muted font-mono">
                {error.digest}
              </code>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
