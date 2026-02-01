"use client";

import { useRef, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { MessageItem } from "./MessageItem";
import { MessageInput } from "./MessageInput";
import { Skeleton } from "@packages/ui/components/skeleton";
import { MessageSquare } from "lucide-react";
import { ScrollArea } from "@packages/ui/components/scroll-area";

interface TaskThreadProps {
  taskId: Id<"tasks">;
  accountSlug: string;
}

/**
 * Task thread component with messages and input.
 */
export function TaskThread({ taskId, accountSlug }: TaskThreadProps) {
  const messages = useQuery(api.messages.listByTask, { taskId });
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ 
        top: scrollRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [messages?.length]);
  
  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-1">
          {messages === undefined ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3 p-3">
                  <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : messages.length > 0 ? (
            messages.map((message) => (
              <MessageItem key={message._id} message={message} />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                <MessageSquare className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No messages yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Start the conversation by sending a message or mentioning an agent.
              </p>
            </div>
          )}
        </div>
      </div>
      <MessageInput taskId={taskId} />
    </div>
  );
}
