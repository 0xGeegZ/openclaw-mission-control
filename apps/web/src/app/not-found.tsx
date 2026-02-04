import Link from "next/link";
import { Button } from "@packages/ui/components/button";
import { Home, ArrowLeft, Compass } from "lucide-react";

/**
 * Custom 404 Not Found page.
 * Provides a friendly error message with navigation options to help users
 * find their way back to the main application.
 */
export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-background relative overflow-hidden">
      {/* Background decorations matching the splash page style */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-muted/30 rounded-full blur-3xl" />
      </div>

      {/* Icon */}
      <div className="relative mb-8">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-muted/80 to-muted/40 shadow-sm">
          <Compass className="h-12 w-12 text-muted-foreground/60" />
        </div>
        {/* Floating "404" badge */}
        <div className="absolute -top-2 -right-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-md">
          404
        </div>
      </div>

      {/* Content */}
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
        Page not found
      </h1>
      <p className="text-lg text-muted-foreground max-w-md leading-relaxed mb-8">
        The page you are looking for does not exist or has been moved. Let us
        help you find your way back.
      </p>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Button
          asChild
          variant="outline"
          className="w-full sm:w-auto rounded-xl"
        >
          <Link href="javascript:history.back()">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Link>
        </Button>
        <Button asChild className="w-full sm:w-auto rounded-xl shadow-sm">
          <Link href="/">
            <Home className="h-4 w-4 mr-2" />
            Back to Home
          </Link>
        </Button>
      </div>

      {/* Helpful links section */}
      <div className="mt-16 pt-8 border-t border-border/40 w-full max-w-md">
        <p className="text-sm text-muted-foreground mb-4">
          Looking for something specific?
        </p>
        <div className="flex flex-wrap justify-center gap-4 text-sm">
          <Link
            href="/dashboard"
            className="text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1.5"
          >
            Dashboard
          </Link>
          <span className="text-border">|</span>
          <Link
            href="/sign-in"
            className="text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1.5"
          >
            Sign In
          </Link>
          <span className="text-border">|</span>
          <Link
            href="/sign-up"
            className="text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1.5"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </div>
  );
}
