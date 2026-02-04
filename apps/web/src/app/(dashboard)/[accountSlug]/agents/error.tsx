"use client";

import { ErrorFallback } from "@/components/ui/ErrorBoundary";

export default function AgentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorFallback error={error} reset={reset} />;
}
