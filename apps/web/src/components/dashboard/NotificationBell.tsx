"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id, Doc } from "@packages/backend/convex/_generated/dataModel";
import {
  Bell,
  BellOff,
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
  ChevronDown,
} from "lucide-react";
import { Button } from "@packages/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@packages/ui/components/popover";
import { Skeleton } from "@packages/ui/components/skeleton";
import { useAccount } from "@/lib/hooks/useAccount";
import { cn } from "@packages/ui/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import type { NotificationType } from "@packages/shared";

interface NotificationBellProps {
  accountSlug: string;
}

const NOTIFICATION_LIST_LIMIT = 10;

/** Icons keyed by backend NotificationType. */
const notificationIcons: Record<NotificationType, typeof Bell> = {
  mention: Bot,
  assignment: CheckSquare,
  thread_update: MessageSquare,
  status_change: ArrowRightLeft,
  member_added: UserPlus,
  member_removed: UserMinus,
  role_changed: Shield,
};

/** Color classes keyed by backend NotificationType. */
const notificationColors: Record<NotificationType, string> = {
  mention:
    "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  assignment:
    "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  thread_update:
    "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  status_change:
    "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  member_added:
    "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  member_removed:
    "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400",
  role_changed:
    "bg-slate-100 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400",
};

/**
 * Notification bell with unread count badge. Opens a popover with recent
 * notifications with dismiss/mark-all actions and pagination.
 */
export function NotificationBell({ accountSlug }: NotificationBellProps) {
  const { accountId, account } = useAccount();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [accumulatedMore, setAccumulatedMore] = useState<
    Doc<"notifications">[]
  >([]);
  const [cursorToFetch, setCursorToFetch] = useState<
    Id<"notifications"> | undefined
  >(undefined);
  const [lastNextCursor, setLastNextCursor] = useState<
    Id<"notifications"> | undefined
  >(undefined);

  const unreadCount = useQuery(
    api.notifications.getUnreadCount,
    accountId ? { accountId } : "skip",
  );

  const result = useQuery(
    api.notifications.list,
    accountId && open
      ? { accountId, filter, limit: NOTIFICATION_LIST_LIMIT }
      : "skip",
  );

  const resultMore = useQuery(
    api.notifications.list,
    accountId && open && cursorToFetch
      ? {
          accountId,
          filter,
          limit: NOTIFICATION_LIST_LIMIT,
          cursor: cursorToFetch,
        }
      : "skip",
  );

  useEffect(() => {
    if (!cursorToFetch || resultMore === undefined) return;
    const nextCursor = resultMore.nextCursor;
    const page = resultMore.notifications ?? [];
    queueMicrotask(() => {
      setAccumulatedMore((prev) => [...prev, ...page]);
      setLastNextCursor(nextCursor);
      setCursorToFetch(undefined);
    });
  }, [cursorToFetch, resultMore]);

  const firstPage = result?.notifications ?? [];
  const notifications = [...firstPage, ...accumulatedMore];
  const nextCursor = cursorToFetch
    ? undefined
    : (result?.nextCursor ?? lastNextCursor);

  const markAllAsRead = useMutation(api.notifications.markAllAsRead);
  const dismissAll = useMutation(api.notifications.dismissAll);
  const removeNotification = useMutation(api.notifications.remove);

  const hasUnread = unreadCount !== undefined && unreadCount > 0;
  const accountSlugResolved = account?.slug ?? accountSlug;

  const handleMarkAllAsRead = async () => {
    if (!accountId) return;
    try {
      await markAllAsRead({ accountId });
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Failed to mark all as read");
    }
  };

  const handleDismissAll = async () => {
    if (!accountId) return;
    try {
      await dismissAll({ accountId });
      toast.success("All notifications dismissed");
    } catch {
      toast.error("Failed to dismiss notifications");
    }
  };

  const handleLoadMore = () => {
    const cursor = result?.nextCursor ?? lastNextCursor;
    if (cursor) setCursorToFetch(cursor);
  };

  const handleDismiss = async (notificationId: Id<"notifications">) => {
    try {
      await removeNotification({ notificationId });
      toast.success("Notification dismissed");
    } catch {
      toast.error("Failed to dismiss notification");
    }
  };

  const listUnreadCount = notifications.filter((n) => !n.readAt).length;
  const isLoadingMore = cursorToFetch !== undefined;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setAccumulatedMore([]);
      setCursorToFetch(undefined);
      setLastNextCursor(undefined);
    }
  };

  const resetPagination = () => {
    setAccumulatedMore([]);
    setCursorToFetch(undefined);
    setLastNextCursor(undefined);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative h-9 w-9 rounded-xl transition-all duration-200",
            hasUnread && "hover:bg-primary/10",
          )}
          aria-label={
            hasUnread ? `${unreadCount} unread notifications` : "Notifications"
          }
        >
          <Bell
            className={cn(
              "h-4 w-4 transition-colors",
              hasUnread && "text-primary",
            )}
          />
          {hasUnread && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40 opacity-75" />
              <span className="relative inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-sm">
                {unreadCount !== undefined && unreadCount > 99
                  ? "99+"
                  : unreadCount}
              </span>
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[380px] p-0 rounded-xl"
        align="end"
        side="bottom"
        sideOffset={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-col max-h-[min(70vh,420px)]">
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b bg-muted/30">
            <div className="flex rounded-lg border border-border bg-background p-0.5">
              <Button
                variant={filter === "all" ? "secondary" : "ghost"}
                size="sm"
                className="gap-1.5 h-7 text-xs"
                onClick={() => {
                  setFilter("all");
                  resetPagination();
                }}
              >
                <Filter className="h-3 w-3" />
                All
              </Button>
              <Button
                variant={filter === "unread" ? "secondary" : "ghost"}
                size="sm"
                className="gap-1.5 h-7 text-xs"
                onClick={() => {
                  setFilter("unread");
                  resetPagination();
                }}
              >
                Unread
              </Button>
            </div>
            {notifications.length > 0 && filter === "all" && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={handleDismissAll}
                title="Dismiss all notifications"
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Dismiss all
              </Button>
            )}
            {notifications.length > 0 && filter === "unread" && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={handleMarkAllAsRead}
                title={listUnreadCount > 0 ? "Mark all as read" : "All read"}
              >
                <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
                Mark all read
              </Button>
            )}
          </div>

          <div className="overflow-y-auto flex-1 min-h-0">
            {result === undefined ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-3 p-2.5">
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-4/5" />
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-2.5 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50 mb-3">
                  <BellOff className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  All caught up!
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {filter === "unread"
                    ? "No unread notifications."
                    : "Notifications will appear here."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((notification) => {
                  const isUnread = !notification.readAt;
                  const type = notification.type as NotificationType;
                  const Icon = notificationIcons[type] ?? Bell;
                  const colorClass =
                    notificationColors[type] ??
                    "bg-muted text-muted-foreground";
                  const taskId = notification.taskId;
                  const href =
                    accountSlugResolved && taskId
                      ? `/${accountSlugResolved}/tasks/${taskId}`
                      : null;

                  const textContent = (
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-sm leading-snug",
                          isUnread && "font-medium",
                        )}
                      >
                        {notification.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {notification.body}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        {formatDistanceToNow(new Date(notification.createdAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  );

                  return (
                    <div
                      key={notification._id}
                      className={cn(
                        "flex gap-3 p-2.5 transition-colors hover:bg-muted/50",
                        isUnread && "bg-primary/5",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                          colorClass,
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      {href ? (
                        <Link
                          href={href}
                          className="flex flex-1 min-w-0 text-left"
                          onClick={() => setOpen(false)}
                        >
                          {textContent}
                        </Link>
                      ) : (
                        <div className="flex flex-1 min-w-0">{textContent}</div>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDismiss(notification._id)}
                        title="Dismiss"
                        aria-label="Dismiss notification"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
                <div className="p-2 border-t border-border bg-muted/20">
                  {nextCursor ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-8 text-xs gap-1.5"
                      onClick={handleLoadMore}
                      disabled={isLoadingMore}
                      aria-label="Load more notifications"
                    >
                      {isLoadingMore ? (
                        "Loading…"
                      ) : (
                        <>
                          <ChevronDown className="h-3.5 w-3.5" />
                          Load more
                        </>
                      )}
                    </Button>
                  ) : (
                    <p className="text-center text-xs text-muted-foreground py-1">
                      {notifications.length > 0
                        ? "No more notifications"
                        : null}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
