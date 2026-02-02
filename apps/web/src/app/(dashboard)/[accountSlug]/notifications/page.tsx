"use client";

import { use } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
import { Card, CardContent } from "@packages/ui/components/card";
import { Button } from "@packages/ui/components/button";
import { Badge } from "@packages/ui/components/badge";
import { Skeleton } from "@packages/ui/components/skeleton";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@packages/ui/lib/utils";
import { 
  Bell, 
  BellOff,
  Check,
  CheckCheck,
  CheckSquare,
  Bot,
  UserPlus,
  AlertCircle,
  Info,
} from "lucide-react";

interface NotificationsPageProps {
  params: Promise<{ accountSlug: string }>;
}

/** Display type for icons/colors. Backend sends mention | assignment | thread_update | status_change; we map for UI. */
type NotificationType = "task_assigned" | "task_completed" | "agent_message" | "member_joined" | "system" | "info";

const notificationIcons: Record<NotificationType, typeof Bell> = {
  task_assigned: CheckSquare,
  task_completed: Check,
  agent_message: Bot,
  member_joined: UserPlus,
  system: AlertCircle,
  info: Info,
};

const notificationColors: Record<NotificationType, string> = {
  task_assigned: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  task_completed: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  agent_message: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  member_joined: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  system: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  info: "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400",
};

/**
 * Notifications page showing all user notifications.
 */
export default function NotificationsPage({ params }: NotificationsPageProps) {
  use(params);
  const { accountId } = useAccount();
  
  const notifications = useQuery(
    api.notifications.list,
    accountId ? { accountId, limit: 50 } : "skip"
  );
  
  const markAllAsRead = useMutation(api.notifications.markAllAsRead);
  const markAsRead = useMutation(api.notifications.markAsRead);
  
  const handleMarkAllAsRead = async () => {
    if (accountId) {
      await markAllAsRead({ accountId });
    }
  };
  
  const unreadCount = notifications?.filter(n => !n.readAt).length ?? 0;
  
  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
            {unreadCount > 0 && (
              <Badge variant="secondary">
                {unreadCount} unread
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Stay updated on your workspace activity</p>
        </div>
        {notifications && notifications.length > 0 && unreadCount > 0 && (
          <Button variant="outline" onClick={handleMarkAllAsRead}>
            <CheckCheck className="mr-2 h-4 w-4" />
            Mark all as read
          </Button>
        )}
      </header>
      
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto p-6">
          {notifications === undefined ? (
            <Card>
              <CardContent className="p-0 divide-y">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-4 p-4">
                    <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : notifications.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                  <BellOff className="h-7 w-7 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">No notifications yet</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  When you receive notifications about tasks, agents, or team activity, they will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 divide-y divide-border">
                {notifications.map((notification) => {
                  const isUnread = !notification.readAt;
                  const Icon = notificationIcons[notification.type as NotificationType] || Bell;
                  const colorClass = notificationColors[notification.type as NotificationType] || notificationColors.info;
                  const createdAt = notification.createdAt;

                  return (
                    <div
                      key={notification._id}
                      className={cn(
                        "flex gap-4 p-4 transition-colors hover:bg-muted/50",
                        isUnread && "bg-primary/5"
                      )}
                    >
                      <div className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-full shrink-0",
                        colorClass
                      )}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className={cn(
                              "text-sm",
                              isUnread && "font-medium"
                            )}>
                              {notification.title}
                            </p>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {notification.body}
                            </p>
                          </div>
                          {isUnread && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={() => markAsRead({ notificationId: notification._id })}
                            >
                              <Check className="h-4 w-4" />
                              <span className="sr-only">Mark as read</span>
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
