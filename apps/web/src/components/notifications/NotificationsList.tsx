"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@packages/ui/components/button";
import { Badge } from "@packages/ui/components/badge";
import { NOTIFICATION_TYPE, type NotificationType } from "@packages/shared";
import {
  AlertCircle,
  Bell,
  MessageSquare,
  CheckCircle2,
  Users,
  Shield,
  Trash2,
  MailCheck,
} from "lucide-react";

export interface NotificationItem {
  _id: string;
  type: NotificationType;
  title: string;
  body: string;
  readAt?: number;
  createdAt: number;
  taskId?: string;
  messageId?: string;
  actorName?: string;
}

interface NotificationsListProps {
  notifications: NotificationItem[];
  onMarkAsRead?: (id: string) => void;
  onMarkAllAsRead?: () => void;
  onDismiss?: (id: string) => void;
  onNavigate?: (taskId: string) => void;
  filterBy?: "all" | "unread";
  isLoading?: boolean;
  error?: string | null;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case NOTIFICATION_TYPE.MENTION:
      return <AlertCircle className="w-4 h-4 text-blue-500" />;
    case NOTIFICATION_TYPE.THREAD_UPDATE:
      return <MessageSquare className="w-4 h-4 text-green-500" />;
    case NOTIFICATION_TYPE.ASSIGNMENT:
      return <CheckCircle2 className="w-4 h-4 text-orange-500" />;
    case NOTIFICATION_TYPE.STATUS_CHANGE:
      return <CheckCircle2 className="w-4 h-4 text-purple-500" />;
    case NOTIFICATION_TYPE.MEMBER_ADDED:
    case NOTIFICATION_TYPE.MEMBER_REMOVED:
      return <Users className="w-4 h-4 text-indigo-500" />;
    case NOTIFICATION_TYPE.ROLE_CHANGED:
      return <Shield className="w-4 h-4 text-red-500" />;
    case NOTIFICATION_TYPE.RESPONSE_REQUEST:
      return <MessageSquare className="w-4 h-4 text-cyan-500" />;
    default:
      return <Bell className="w-4 h-4 text-gray-500" />;
  }
}

const NOTIFICATION_BADGE_LABELS: Record<NotificationType, string> = {
  [NOTIFICATION_TYPE.MENTION]: "Mention",
  [NOTIFICATION_TYPE.THREAD_UPDATE]: "Reply",
  [NOTIFICATION_TYPE.ASSIGNMENT]: "Assigned",
  [NOTIFICATION_TYPE.STATUS_CHANGE]: "Status",
  [NOTIFICATION_TYPE.MEMBER_ADDED]: "Member",
  [NOTIFICATION_TYPE.MEMBER_REMOVED]: "Removed",
  [NOTIFICATION_TYPE.ROLE_CHANGED]: "Role",
  [NOTIFICATION_TYPE.RESPONSE_REQUEST]: "Request",
};

export function getNotificationTypeLabel(type: NotificationType): string {
  const labels: Record<NotificationType, string> = NOTIFICATION_BADGE_LABELS;
  return labels[type] || "Notification";
}

/**
 * Counts notifications that are still unread.
 */
export function getUnreadCount(notifications: NotificationItem[]): number {
  return notifications.filter((notification) => !notification.readAt).length;
}

/**
 * Applies list filtering based on the selected view.
 */
export function getDisplayedNotifications(
  notifications: NotificationItem[],
  filterBy: "all" | "unread",
): NotificationItem[] {
  return filterBy === "unread"
    ? notifications.filter((notification) => !notification.readAt)
    : notifications;
}

/**
 * Excludes dismissed notifications from the rendered list.
 */
export function getVisibleNotifications(
  notifications: NotificationItem[],
  dismissed: Set<string>,
): NotificationItem[] {
  return notifications.filter(
    (notification) => !dismissed.has(notification._id),
  );
}

export function NotificationsList({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDismiss,
  onNavigate,
  filterBy = "all",
  isLoading = false,
  error = null,
  onLoadMore,
  hasMore = false,
}: NotificationsListProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const unreadCount = getUnreadCount(notifications);
  const displayedNotifications = getDisplayedNotifications(
    notifications,
    filterBy,
  );
  const visibleNotifications = getVisibleNotifications(
    displayedNotifications,
    dismissed,
  );

  const handleDismiss = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
    onDismiss?.(id);
  };

  const handleNotificationOpen = (
    notification: NotificationItem,
    isUnread: boolean,
  ) => {
    if (isUnread) {
      onMarkAsRead?.(notification._id);
    }
    if (notification.taskId) {
      onNavigate?.(notification.taskId);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="w-8 h-8 text-red-500 mb-4" />
        <p className="text-sm text-red-600 font-medium">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (visibleNotifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <Bell className="w-8 h-8 text-gray-400 mb-4" />
        <p className="text-sm text-gray-600 font-medium">
          {filterBy === "unread"
            ? "No unread notifications"
            : "No notifications"}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header with Mark All as Read */}
      {unreadCount > 0 && (
        <div className="flex items-center justify-between p-4 border-b bg-blue-50 dark:bg-blue-950">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{unreadCount} unread</Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onMarkAllAsRead}
            className="gap-2"
          >
            <MailCheck className="w-4 h-4" />
            Mark all as read
          </Button>
        </div>
      )}

      {/* Notifications List */}
      <div className="divide-y">
        {visibleNotifications.map((notification) => {
          const isUnread = !notification.readAt;
          const timestamp = formatDistanceToNow(notification.createdAt, {
            addSuffix: true,
          });

          return (
            <div
              key={notification._id}
              className={`flex gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition ${
                isUnread ? "bg-blue-50 dark:bg-blue-950" : ""
              }`}
            >
              {/* Icon */}
              <div className="flex-shrink-0 mt-1">
                {getNotificationIcon(notification.type)}
              </div>

              {/* Content */}
              <div
                className="flex-1 min-w-0 cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={`Open notification: ${notification.title}`}
                onClick={() => handleNotificationOpen(notification, isUnread)}
                onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleNotificationOpen(notification, isUnread);
                  }
                }}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <p
                      className={`text-sm font-medium leading-tight ${
                        isUnread
                          ? "text-gray-900 dark:text-gray-50"
                          : "text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {notification.title}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {notification.body}
                    </p>
                  </div>

                  {/* Type Badge */}
                  <Badge variant="outline" className="flex-shrink-0">
                    {getNotificationTypeLabel(notification.type)}
                  </Badge>
                </div>

                {/* Timestamp */}
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                  {timestamp}
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-shrink-0 gap-1">
                {isUnread && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation();
                      onMarkAsRead?.(notification._id);
                    }}
                    title="Mark as read"
                    aria-label={`Mark notification "${notification.title}" as read`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    handleDismiss(notification._id);
                  }}
                  title="Dismiss"
                  aria-label={`Dismiss notification "${notification.title}"`}
                >
                  <Trash2 className="w-4 h-4 text-gray-400" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Load More Button */}
      {hasMore && (
        <div className="p-4 border-t text-center">
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            className="w-full"
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
