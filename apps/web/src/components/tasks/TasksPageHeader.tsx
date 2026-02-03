"use client";

import dynamic from "next/dynamic";
import { DashboardStats } from "@/components/dashboard/DashboardStats";

/** Loaded client-only to avoid hydration mismatch (time/locale differ on server vs client). */
const LiveClock = dynamic(
  () =>
    import("@/components/dashboard/LiveClock").then((m) => ({
      default: m.LiveClock,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-w-24 items-center gap-2 text-sm text-muted-foreground">
        <span className="h-4 w-4 shrink-0" aria-hidden />
        <span className="tabular-nums">--:--:--</span>
      </div>
    ),
  }
);

interface TasksPageHeaderProps {
  accountSlug: string;
}

/**
 * Tasks page header with title, stats, and live clock.
 */
export function TasksPageHeader({ accountSlug }: TasksPageHeaderProps) {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b bg-card">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
        <p className="text-sm text-muted-foreground">
          Manage and track your team&apos;s work
        </p>
      </div>
      <div className="flex items-center gap-6">
        <DashboardStats accountSlug={accountSlug} />
        <LiveClock />
      </div>
    </header>
  );
}
