"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
import { Card, CardContent } from "@packages/ui/components/card";
import { Button } from "@packages/ui/components/button";
import { Badge } from "@packages/ui/components/badge";
import { Skeleton } from "@packages/ui/components/skeleton";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@packages/ui/lib/utils";
import type { NotificationType } from "@packages/shared";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  CheckSquare,
  Bot,
  MessageSquare,
  ArrowRightLeft,
  UserPlus,
  UserMinus,
  Shield,
  Filter,
  X,
} from "lucide-react";

interface NotificationsPageProps {
  params: Promise<{ accountSlug: string }>;
}

/** Icons and colors keyed by backend NotificationType. */
const notificationIcons: Record<NotificationType, typeof Bell> = {
  mention: Bot,
  assignment: CheckSquare,
  thread_update: MessageSquare,
  status_change: ArrowRightLeft,
  member_added: UserPlus,
  member_removed: UserMinus,
  role_changed: Shield,
};

const notificationColors: Record<NotificationType, string> = {
  mention: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  assignment: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  thread_update: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  status_change: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  member_added: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  member_removed: "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400",
  role_changed: "bg-slate-100 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400",
};

/**
 * Notifications page: list with filter (all/unread), deep links to tasks.
 */
export default function NotificationsPage({ params }: NotificationsPageProps) {
  use(params);
  const { accountId, account } = useAccount();
  const accountSlug = account?.slug ?? null;
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const result = useQuery(
    api.notifications.list,
    accountId
      ? { accountId, filter, limit: 50 }
      : "skip"
  );

  const notifications = result?.notifications ?? [];
  const markAllAsRead = useMutation(api.notifications.markAllAsRead);
  const markAsRead = useMutation(api.notifications.markAsRead);
  const removeNotification = useMutation(api.notifications.remove);

  const handleMarkAllAsRead = async () => {
    if (accountId) {
      await markAllAsRead({ accountId });
    }
  };
  
  const handleDismiss = async (notificationId: typeof notifications[0]["_id"]) => {
    await removeNotification({ notificationId });
  };

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="flex flex-col h-full">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-4 border-b bg-card">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
            {unreadCount > 0 && (
              <Badge variant="secondary">{unreadCount} unread</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Stay updated on your workspace activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border bg-muted/30 p-0.5">
            <Button
              variant={filter === "all" ? "secondary" : "ghost"}
              size="sm"
              className="gap-1.5"
              onClick={() => setFilter("all")}
            >
              <Filter className="h-3.5 w-3.5" />
              All
            </Button>
            <Button
              variant={filter === "unread" ? "secondary" : "ghost"}
              size="sm"
              className="gap-1.5"
              onClick={() => setFilter("unread")}
            >
              Unread
            </Button>
          </div>
          {notifications.length > 0 && unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllAsRead}>
              <CheckCheck className="mr-2 h-4 w-4" />
              Mark all read
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto p-6">
          {result === undefined ? (
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
            <Card className="overflow-hidden">
              <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                <div className="relative mb-5">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-muted to-muted/50 shadow-sm">
                    <BellOff className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-emerald-500/10 flex items-center justify-center ring-2 ring-card">
                    <Check className="h-3 w-3 text-emerald-500" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-foreground">All caught up!</h3>
                <p className="text-sm text-muted-foreground/70 mt-2 max-w-sm leading-relaxed">
                  {filter === "unread" 
                    ? "No unread notifications. Check 'All' to see your notification history."
                    : "When you receive notifications about tasks, agents, or team activity, they will appear here."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 divide-y divide-border">
                {notifications.map((notification) => {
                  const isUnread = !notification.readAt;
                  const type = notification.type as NotificationType;
                  const Icon = notificationIcons[type] ?? Bell;
                  const colorClass =
                    notificationColors[type] ?? "bg-muted text-muted-foreground";
                  const createdAt = notification.createdAt;
                  const taskId = notification.taskId;
                  const href =
                    accountSlug && taskId
                      ? `/${accountSlug}/tasks/${taskId}`
                      : null;

                  const textContent = (
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-sm",
                          isUnread && "font-medium"
                        )}
                      >
                        {notification.title}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {notification.body}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {formatDistanceToNow(new Date(createdAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  );

                  return (
                    <div
                      key={notification._id}
                      className={cn(
                        "flex gap-4 p-4 transition-colors hover:bg-muted/50",
                        isUnread && "bg-primary/5"
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-full shrink-0",
                          colorClass
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      {href ? (
                        <Link
                          href={href}
                          className="flex flex-1 min-w-0 text-left"
                        >
                          {textContent}
                        </Link>
                      ) : (
                        textContent
                      )}
                      <div className="flex items-center gap-1 shrink-0">
                        {isUnread && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              markAsRead({ notificationId: notification._id })
                            }
                            title="Mark as read"
                          >
                            <Check className="h-4 w-4" />
                            <span className="sr-only">Mark as read</span>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDismiss(notification._id)}
                          title="Dismiss notification"
                        >
                          <X className="h-4 w-4" />
                          <span className="sr-only">Dismiss</span>
                        </Button>
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
