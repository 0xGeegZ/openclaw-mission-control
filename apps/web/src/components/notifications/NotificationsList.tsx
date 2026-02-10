"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@packages/ui/components/button";
import { Badge } from "@packages/ui/components/badge";
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

interface Notification {
  _id: string;
  type:
    | "mention"
    | "thread_update"
    | "assignment"
    | "status_change"
    | "member_added"
    | "member_removed"
    | "role_changed"
    | "response_request";
  title: string;
  body: string;
  readAt?: number;
  createdAt: number;
  taskId?: string;
  messageId?: string;
  actorName?: string;
}

interface NotificationsListProps {
  notifications: Notification[];
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

function getNotificationIcon(type: string) {
  switch (type) {
    case "mention":
      return <AlertCircle className="w-4 h-4 text-blue-500" />;
    case "thread_update":
      return <MessageSquare className="w-4 h-4 text-green-500" />;
    case "assignment":
      return <CheckCircle2 className="w-4 h-4 text-orange-500" />;
    case "status_change":
      return <CheckCircle2 className="w-4 h-4 text-purple-500" />;
    case "member_added":
    case "member_removed":
      return <Users className="w-4 h-4 text-indigo-500" />;
    case "role_changed":
      return <Shield className="w-4 h-4 text-red-500" />;
    case "response_request":
      return <MessageSquare className="w-4 h-4 text-cyan-500" />;
    default:
      return <Bell className="w-4 h-4 text-gray-500" />;
  }
}

function getNotificationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    mention: "Mention",
    thread_update: "Reply",
    assignment: "Assigned",
    status_change: "Status",
    member_added: "Member",
    member_removed: "Removed",
    role_changed: "Role",
    response_request: "Request",
  };
  return labels[type] || "Notification";
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

  const unreadCount = notifications.filter((n) => !n.readAt).length;
  const displayedNotifications =
    filterBy === "unread"
      ? notifications.filter((n) => !n.readAt)
      : notifications;

  const visibleNotifications = displayedNotifications.filter(
    (n) => !dismissed.has(n._id)
  );

  const handleDismiss = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
    onDismiss?.(id);
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
          <div
            key={i}
            className="h-16 bg-gray-100 rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (visibleNotifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <Bell className="w-8 h-8 text-gray-400 mb-4" />
        <p className="text-sm text-gray-600 font-medium">
          {filterBy === "unread" ? "No unread notifications" : "No notifications"}
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
                onClick={() => {
                  if (isUnread) onMarkAsRead?.(notification._id);
                  if (notification.taskId) onNavigate?.(notification.taskId);
                }}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <p
                      className={`text-sm font-medium leading-tight ${
                        isUnread ? "text-gray-900 dark:text-gray-50" : "text-gray-700 dark:text-gray-300"
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
