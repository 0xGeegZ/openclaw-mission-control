import { ReactNode } from "react";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";

/**
 * Auth layout with Soft Pop design system styling.
 * Provides a branded wrapper for sign-in and sign-up pages.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background decorations - Soft Pop style with purple, teal, and orange */}
      <div className="absolute inset-0 -z-10">
        {/* Top-left purple gradient orb */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        {/* Bottom-right teal gradient orb */}
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-secondary/40 rounded-full blur-3xl" />
        {/* Center accent orb - orange */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/15 rounded-full blur-3xl" />
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-10 p-6">
        <Link href="/" className="inline-flex items-center gap-2.5 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-md transition-transform group-hover:scale-105">
            <LayoutDashboard className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground text-lg tracking-tight">
            OpenClaw Mission Control
          </span>
        </Link>
      </header>

      {/* Main content */}
      <main className="flex min-h-screen items-center justify-center px-4 py-24">
        {children}
      </main>

      {/* Footer */}
      <footer className="absolute bottom-0 left-0 right-0 p-6 text-center text-sm text-muted-foreground">
        <p>
          2026 OpenClaw Mission Control.{" "}
          <Link
            href="/privacy"
            className="hover:text-foreground transition-colors"
          >
            Privacy
          </Link>
          {" | "}
          <Link
            href="/terms"
            className="hover:text-foreground transition-colors"
          >
            Terms
          </Link>
        </p>
      </footer>
    </div>
  );
}
