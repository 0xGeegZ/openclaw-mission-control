"use client";

import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { LiveClock } from "@/components/dashboard/LiveClock";

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
