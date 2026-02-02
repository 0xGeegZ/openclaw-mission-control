"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { Button } from "@packages/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@packages/ui/components/tooltip";
import { useAuth } from "@clerk/nextjs";
import { toast } from "sonner";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { useState } from "react";

interface TaskSubscriptionProps {
  taskId: Id<"tasks">;
}

/**
 * Subscribe/unsubscribe button for task threads.
 * Shows bell icon indicating subscription status.
 */
export function TaskSubscription({ taskId }: TaskSubscriptionProps) {
  const { userId } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  
  const isSubscribed = useQuery(
    api.subscriptions.isSubscribed,
    userId
      ? { taskId, subscriberType: "user", subscriberId: userId }
      : "skip"
  );
  
  const subscribe = useMutation(api.subscriptions.subscribe);
  const unsubscribe = useMutation(api.subscriptions.unsubscribe);
  
  const handleToggle = async () => {
    setIsUpdating(true);
    try {
      if (isSubscribed) {
        await unsubscribe({ taskId });
        toast.success("Unsubscribed from task");
      } else {
        await subscribe({ taskId });
        toast.success("Subscribed to task");
      }
    } catch (error) {
      toast.error("Failed to update subscription", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsUpdating(false);
    }
  };
  
  if (isSubscribed === undefined) {
    return (
      <Button variant="ghost" size="sm" disabled className="gap-1.5">
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={isSubscribed ? "secondary" : "ghost"}
            size="sm"
            className="gap-1.5"
            onClick={handleToggle}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isSubscribed ? (
              <Bell className="h-4 w-4" />
            ) : (
              <BellOff className="h-4 w-4" />
            )}
            {isSubscribed ? "Following" : "Follow"}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isSubscribed
            ? "You will be notified of updates. Click to unfollow."
            : "Follow to receive notifications about this task."}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
