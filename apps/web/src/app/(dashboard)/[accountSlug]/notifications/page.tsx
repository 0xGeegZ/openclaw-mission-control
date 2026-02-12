"use client";

import { use } from "react";
import { useAccount } from "@/lib/hooks/useAccount";
import { NotificationsPageContent } from "@/components/notifications/NotificationsPageContent";

interface NotificationsPageProps {
  params: Promise<{ accountSlug: string }>;
}

/**
 * Notifications page - displays user notifications with list, filtering, and actions.
 * Shows all notification types: mentions, assignments, status changes, member updates, etc.
 */
export default function NotificationsPage({ params }: NotificationsPageProps) {
  const { accountSlug } = use(params);
  const { accountId } = useAccount();

  if (!accountId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return <NotificationsPageContent accountSlug={accountSlug} accountId={accountId} />;
}
