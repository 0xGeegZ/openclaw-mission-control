"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Bell } from "lucide-react";
import { Button } from "@packages/ui/components/button";
import { Badge } from "@packages/ui/components/badge";
import { useAccount } from "@/lib/hooks/useAccount";

interface NotificationBellProps {
  accountSlug: string;
}

/**
 * Notification bell with unread count badge.
 */
export function NotificationBell({ accountSlug }: NotificationBellProps) {
  const { accountId } = useAccount();
  
  const unreadCount = useQuery(
    api.notifications.getUnreadCount,
    accountId ? { accountId } : "skip"
  );
  
  return (
    <Button variant="ghost" size="icon" asChild className="relative">
      <Link href={`/${accountSlug}/notifications`}>
        <Bell className="h-4 w-4" />
        {unreadCount && unreadCount > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        )}
        <span className="sr-only">Notifications</span>
      </Link>
    </Button>
  );
}
