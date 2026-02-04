"use client";

import { Component, ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  RefreshCw,
  Home,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@packages/ui/components/button";
import { Card, CardContent } from "@packages/ui/components/card";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  variant?: "page" | "section" | "inline";
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

/**
 * Error boundary component with retry functionality.
 * Catches JavaScript errors in child components and displays a fallback UI.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
    this.props.onReset?.();
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { variant = "page" } = this.props;
      const { error, showDetails } = this.state;

      if (variant === "inline") {
        return (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-destructive">
                Something went wrong
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {error?.message || "An unexpected error occurred"}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={this.handleReset}
              className="shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        );
      }

      if (variant === "section") {
        return (
          <Card className="border-destructive/20 bg-destructive/5">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 mb-4">
                <AlertTriangle className="h-7 w-7 text-destructive" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                Failed to load
              </h3>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-xs">
                {error?.message ||
                  "An unexpected error occurred while loading this section."}
              </p>
              <Button onClick={this.handleReset} className="mt-5" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </CardContent>
          </Card>
        );
      }

      // Full page error
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
          <div className="relative mb-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-destructive/15 to-destructive/5 shadow-sm">
              <AlertTriangle className="h-10 w-10 text-destructive" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-foreground">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-md leading-relaxed">
            We encountered an unexpected error. Please try again or return to
            the dashboard.
          </p>

          <div className="flex items-center gap-3 mt-6">
            <Button variant="outline" asChild>
              <Link href="/dashboard">
                <Home className="h-4 w-4 mr-2" />
                Go to Dashboard
              </Link>
            </Button>
            <Button onClick={this.handleReset}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>

          {/* Error details (collapsible) */}
          {error && (
            <div className="mt-8 w-full max-w-lg">
              <button
                type="button"
                onClick={this.toggleDetails}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
                aria-expanded={showDetails}
                aria-controls="error-details"
                id="error-details-toggle"
              >
                {showDetails ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                {showDetails ? "Hide" : "Show"} error details
              </button>

              {showDetails && (
                <div
                  id="error-details"
                  role="region"
                  aria-labelledby="error-details-toggle"
                  className="mt-3 p-4 rounded-xl bg-muted/50 border border-border/50 text-left"
                >
                  <p className="text-xs font-medium text-destructive mb-1">
                    {error.name}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono break-all">
                    {error.message}
                  </p>
                  {error.stack && (
                    <pre className="mt-3 text-[10px] text-muted-foreground/70 font-mono overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto">
                      {error.stack}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook-friendly error fallback component for use with error.tsx files.
 */
interface ErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
  variant?: "page" | "section";
}

export function ErrorFallback({
  error,
  reset,
  variant = "page",
}: ErrorFallbackProps) {
  if (variant === "section") {
    return (
      <Card className="border-destructive/20 bg-destructive/5">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 mb-4">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            Failed to load
          </h3>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xs">
            {error?.message || "An unexpected error occurred."}
          </p>
          <Button onClick={reset} className="mt-5" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="relative mb-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-destructive/15 to-destructive/5 shadow-sm">
          <AlertTriangle className="h-10 w-10 text-destructive" />
        </div>
      </div>

      <h1 className="text-2xl font-bold text-foreground">
        Something went wrong
      </h1>
      <p className="text-sm text-muted-foreground mt-2 max-w-md leading-relaxed">
        We encountered an unexpected error. Please try again or return to the
        dashboard.
      </p>

      <div className="flex items-center gap-3 mt-6">
        <Button variant="outline" asChild>
          <Link href="/dashboard">
            <Home className="h-4 w-4 mr-2" />
            Go to Dashboard
          </Link>
        </Button>
        <Button onClick={reset}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
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
  );
}
