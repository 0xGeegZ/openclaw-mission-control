"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Bell } from "lucide-react";
import { Button } from "@packages/ui/components/button";
import { useAccount } from "@/lib/hooks/useAccount";
import { cn } from "@packages/ui/lib/utils";

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
  
  const hasUnread = unreadCount && unreadCount > 0;
  
  return (
    <Button 
      variant="ghost" 
      size="icon" 
      asChild 
      className={cn(
        "relative h-9 w-9 rounded-xl transition-all duration-200",
        hasUnread && "hover:bg-primary/10"
      )}
    >
      <Link href={`/${accountSlug}/notifications`}>
        <Bell className={cn(
          "h-4 w-4 transition-colors",
          hasUnread && "text-primary"
        )} />
        {hasUnread && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40 opacity-75" />
            <span className="relative inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-sm">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          </span>
        )}
        <span className="sr-only">
          {hasUnread ? `${unreadCount} unread notifications` : "Notifications"}
        </span>
      </Link>
    </Button>
  );
}
