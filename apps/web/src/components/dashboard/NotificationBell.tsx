"use client";

import { useState, useEffect, useCallback } from "react";
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
  X,
  ChevronDown,
  Eye,
  Trash2,
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
import { getTaskDetailSheetHref } from "@/lib/utils";

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
  response_request: Bell,
  member_added: UserPlus,
  member_removed: UserMinus,
  role_changed: Shield,
};

/** Subtle icon background colors per type. */
const notificationIconStyles: Record<
  NotificationType,
  { bg: string; text: string }
> = {
  mention: {
    bg: "bg-purple-500/10 dark:bg-purple-500/15",
    text: "text-purple-600 dark:text-purple-400",
  },
  assignment: {
    bg: "bg-blue-500/10 dark:bg-blue-500/15",
    text: "text-blue-600 dark:text-blue-400",
  },
  thread_update: {
    bg: "bg-amber-500/10 dark:bg-amber-500/15",
    text: "text-amber-600 dark:text-amber-400",
  },
  status_change: {
    bg: "bg-green-500/10 dark:bg-green-500/15",
    text: "text-green-600 dark:text-green-400",
  },
  response_request: {
    bg: "bg-sky-500/10 dark:bg-sky-500/15",
    text: "text-sky-600 dark:text-sky-400",
  },
  member_added: {
    bg: "bg-emerald-500/10 dark:bg-emerald-500/15",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  member_removed: {
    bg: "bg-rose-500/10 dark:bg-rose-500/15",
    text: "text-rose-600 dark:text-rose-400",
  },
  role_changed: {
    bg: "bg-slate-500/10 dark:bg-slate-500/15",
    text: "text-slate-600 dark:text-slate-400",
  },
};

/**
 * Notification bell with unread count badge. Opens a popover with recent
 * notifications with dismiss/mark-all actions, inline mark-read on hover, and
 * swipe-to-dismiss style interactions.
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
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());

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
  const notifications = [...firstPage, ...accumulatedMore].filter(
    (n) => !dismissingIds.has(n._id),
  );
  const nextCursor =
    accumulatedMore.length > 0 ? lastNextCursor : result?.nextCursor;

  const markAllAsRead = useMutation(api.notifications.markAllAsRead);
  const markAsRead = useMutation(api.notifications.markAsRead);
  const dismissAll = useMutation(api.notifications.dismissAll);
  const removeNotification = useMutation(api.notifications.remove);

  const hasUnread = unreadCount !== undefined && unreadCount > 0;
  const accountSlugResolved = account?.slug ?? accountSlug;

  const resetPagination = useCallback(() => {
    setAccumulatedMore([]);
    setCursorToFetch(undefined);
    setLastNextCursor(undefined);
  }, []);

  const handleMarkAllAsRead = async () => {
    if (!accountId) return;
    try {
      await markAllAsRead({ accountId });
      resetPagination();
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Failed to mark all as read");
    }
  };

  const handleDismissAll = async () => {
    if (!accountId) return;
    try {
      await dismissAll({ accountId });
      resetPagination();
      toast.success("All notifications dismissed");
    } catch {
      toast.error("Failed to dismiss notifications");
    }
  };

  const handleLoadMore = () => {
    if (cursorToFetch) return;
    const cursor = nextCursor;
    if (cursor) setCursorToFetch(cursor);
  };

  const handleDismiss = async (notificationId: Id<"notifications">) => {
    // Animate out, then remove
    setDismissingIds((prev) => new Set(prev).add(notificationId));
    try {
      await removeNotification({ notificationId });
    } catch {
      // revert animation on failure
      setDismissingIds((prev) => {
        const next = new Set(prev);
        next.delete(notificationId);
        return next;
      });
      toast.error("Failed to dismiss notification");
      return;
    }

    const remainingNotifications = notifications.filter(
      (notification) => notification._id !== notificationId,
    );
    const fallbackCursor =
      remainingNotifications.length > 0
        ? remainingNotifications[remainingNotifications.length - 1]?._id
        : undefined;
    setLastNextCursor((prev) =>
      prev === notificationId ? fallbackCursor : prev,
    );
    setAccumulatedMore((prev) =>
      prev.filter((notification) => notification._id !== notificationId),
    );
    setDismissingIds((prev) => {
      const next = new Set(prev);
      next.delete(notificationId);
      return next;
    });
  };

  const handleMarkRead = async (notificationId: Id<"notifications">) => {
    try {
      await markAsRead({ notificationId });
    } catch {
      toast.error("Failed to mark as read");
    }
  };

  const isLoadingMore = cursorToFetch !== undefined;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setAccumulatedMore([]);
      setCursorToFetch(undefined);
      setLastNextCursor(undefined);
      setDismissingIds(new Set());
    }
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
        className="w-[400px] p-0 rounded-2xl overflow-hidden"
        align="end"
        side="right"
        sideOffset={24}
        collisionPadding={16}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-col max-h-[min(75vh,480px)]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-semibold text-foreground">
                Notifications
              </h3>
              {hasUnread && (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {notifications.length > 0 && (
                <>
                  {filter === "unread" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                      onClick={handleMarkAllAsRead}
                      title="Mark all as read"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Mark all read</span>
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                      onClick={handleDismissAll}
                      title="Clear all notifications"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Clear all</span>
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex border-b px-4">
            <button
              type="button"
              className={cn(
                "relative px-3 py-2 text-xs font-medium transition-colors",
                filter === "all"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => {
                setFilter("all");
                resetPagination();
              }}
            >
              All
              {filter === "all" && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary rounded-full" />
              )}
            </button>
            <button
              type="button"
              className={cn(
                "relative px-3 py-2 text-xs font-medium transition-colors",
                filter === "unread"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => {
                setFilter("unread");
                resetPagination();
              }}
            >
              Unread
              {hasUnread && (
                <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/10 px-1 text-[10px] font-semibold text-primary">
                  {unreadCount}
                </span>
              )}
              {filter === "unread" && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary rounded-full" />
              )}
            </button>
          </div>

          {/* Notification list */}
          <div className="overflow-y-auto flex-1 min-h-0">
            {result === undefined ? (
              <div className="p-3 space-y-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-xl">
                    <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
                    <div className="flex-1 space-y-2 pt-0.5">
                      <Skeleton className="h-3.5 w-4/5" />
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-2.5 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 mb-4">
                  <BellOff className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  All caught up
                </p>
                <p className="text-xs text-muted-foreground mt-1.5 max-w-[220px] leading-relaxed">
                  {filter === "unread"
                    ? "You have no unread notifications right now."
                    : "New notifications will appear here when something happens."}
                </p>
              </div>
            ) : (
              <div className="p-1.5">
                {notifications.map((notification) => {
                  const isUnread = !notification.readAt;
                  const type = notification.type as NotificationType;
                  const Icon = notificationIcons[type] ?? Bell;
                  const iconStyle = notificationIconStyles[type] ?? {
                    bg: "bg-muted",
                    text: "text-muted-foreground",
                  };
                  const taskId = notification.taskId;
                  const href =
                    accountSlugResolved && taskId
                      ? getTaskDetailSheetHref(accountSlugResolved, taskId)
                      : null;

                  const cardContent = (
                    <div className="flex gap-3 flex-1 min-w-0">
                      {/* Icon */}
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                          iconStyle.bg,
                        )}
                      >
                        <Icon className={cn("h-4 w-4", iconStyle.text)} />
                      </div>
                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <p
                            className={cn(
                              "text-sm leading-snug flex-1",
                              isUnread
                                ? "font-medium text-foreground"
                                : "text-foreground/80",
                            )}
                          >
                            {notification.title}
                          </p>
                          {isUnread && (
                            <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                          )}
                        </div>
                        {notification.body && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                            {notification.body}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                          {formatDistanceToNow(
                            new Date(notification.createdAt),
                            { addSuffix: true },
                          )}
                        </p>
                      </div>
                    </div>
                  );

                  return (
                    <div
                      key={notification._id}
                      className={cn(
                        "group relative flex items-start gap-1 rounded-xl p-2.5 transition-all duration-200",
                        "hover:bg-accent/50",
                        isUnread && "bg-primary/[0.03]",
                      )}
                    >
                      {href ? (
                        <Link
                          href={href}
                          className="flex flex-1 min-w-0"
                          onClick={() => {
                            if (isUnread) handleMarkRead(notification._id);
                            setOpen(false);
                          }}
                        >
                          {cardContent}
                        </Link>
                      ) : (
                        <div className="flex flex-1 min-w-0">{cardContent}</div>
                      )}
                      {/* Action buttons (appear on hover) */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-0.5">
                        {isUnread && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg text-muted-foreground hover:text-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkRead(notification._id);
                            }}
                            title="Mark as read"
                            aria-label="Mark as read"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDismiss(notification._id);
                          }}
                          title="Dismiss"
                          aria-label="Dismiss notification"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Load more / footer */}
          {result !== undefined && notifications.length > 0 && (
            <div className="border-t p-2 bg-muted/20">
              {nextCursor ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  aria-label="Load more notifications"
                >
                  {isLoadingMore ? (
                    "Loading..."
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" />
                      Show older notifications
                    </>
                  )}
                </Button>
              ) : (
                <p className="text-center text-[11px] text-muted-foreground/60 py-1">
                  {"That's everything"}
                </p>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
