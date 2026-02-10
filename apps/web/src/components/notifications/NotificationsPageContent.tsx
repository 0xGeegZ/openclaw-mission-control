"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { NotificationsList } from "./NotificationsList";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, ArrowLeft } from "lucide-react";

interface NotificationsPageContentProps {
  accountSlug: string;
  accountId: Id<"accounts">;
}

export function NotificationsPageContent({
  accountSlug,
  accountId,
}: NotificationsPageContentProps) {
  const router = useRouter();
  const [filterBy, setFilterBy] = useState<"all" | "unread">("unread");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allNotifications, setAllNotifications] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Fetch notifications
  const notificationsData = useQuery(api.notifications.listMine, {
    accountId,
    filter: filterBy,
    limit: 50,
    cursor,
  });

  // Mutations
  const markAsRead = useMutation(api.notifications.markAsRead);
  const markAllAsRead = useMutation(api.notifications.markAllAsRead);
  const dismissNotification = useMutation(api.notifications.remove);

  // Load initial notifications
  useEffect(() => {
    if (notificationsData) {
      if (cursor === undefined) {
        // First load - replace all
        setAllNotifications(notificationsData.notifications || []);
      } else {
        // Pagination - append
        setAllNotifications((prev) => [
          ...prev,
          ...(notificationsData.notifications || []),
        ]);
      }
    }
  }, [notificationsData, cursor]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await markAsRead({
        notificationId: notificationId as Id<"notifications">,
      });
      // Update local state
      setAllNotifications((prev) =>
        prev.map((n) =>
          n._id === notificationId ? { ...n, readAt: Date.now() } : n
        )
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to mark notification as read"
      );
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead({ accountId });
      // Update local state
      setAllNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt || Date.now() }))
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to mark all as read"
      );
    }
  };

  const handleDismiss = async (notificationId: string) => {
    try {
      await dismissNotification({
        notificationId: notificationId as Id<"notifications">,
      });
      // Update local state
      setAllNotifications((prev) => prev.filter((n) => n._id !== notificationId));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to dismiss notification"
      );
    }
  };

  const handleNavigate = (taskId: string) => {
    router.push(`/${accountSlug}/tasks/${taskId}`);
  };

  const handleLoadMore = () => {
    if (notificationsData?.nextCursor) {
      setCursor(notificationsData.nextCursor);
    }
  };

  const isLoading = notificationsData === undefined;
  const hasMore = !!notificationsData?.nextCursor;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="border-b bg-white dark:bg-gray-800">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Notifications
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Stay updated with task assignments, messages, and workspace changes
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="border-b border-red-200 bg-red-50 dark:bg-red-950 p-4">
          <div className="container mx-auto flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                {error}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="container mx-auto py-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          {/* Tabs */}
          <Tabs
            value={filterBy}
            onValueChange={(value) => {
              setFilterBy(value as "all" | "unread");
              setCursor(undefined);
              setAllNotifications([]);
            }}
            className="w-full"
          >
            <div className="border-b border-gray-200 dark:border-gray-700 px-4">
              <TabsList className="bg-transparent h-auto p-0 gap-0">
                <TabsTrigger
                  value="unread"
                  className="border-b-2 border-transparent data-[state=active]:border-blue-500 rounded-none px-4 py-3"
                >
                  Unread
                </TabsTrigger>
                <TabsTrigger
                  value="all"
                  className="border-b-2 border-transparent data-[state=active]:border-blue-500 rounded-none px-4 py-3"
                >
                  All
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value={filterBy} className="m-0">
              <NotificationsList
                notifications={allNotifications}
                onMarkAsRead={handleMarkAsRead}
                onMarkAllAsRead={handleMarkAllAsRead}
                onDismiss={handleDismiss}
                onNavigate={handleNavigate}
                filterBy={filterBy}
                isLoading={isLoading}
                error={error}
                onLoadMore={handleLoadMore}
                hasMore={hasMore}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
