"use client";

import { useEffect } from "react";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useBoolean } from "usehooks-ts";
import { Button } from "@packages/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@packages/ui/components/sheet";
import { Skeleton } from "@packages/ui/components/skeleton";
import { TaskThread } from "@/components/tasks/TaskThread";
import { useAccount } from "@/lib/hooks/useAccount";
import { useOrchestratorChat } from "@/lib/hooks/useOrchestratorChat";

/**
 * Floating chat bubble that opens the orchestrator chat thread.
 */
export function OrchestratorChat() {
  const { account, accountId, isLoading: isAccountLoading } = useAccount();
  const { value: isOpen, setTrue, setFalse } = useBoolean(false);
  const {
    taskId,
    isLoading: isChatLoading,
    error,
    isOrchestratorConfigured,
    ensureChatTask,
  } = useOrchestratorChat();

  const accountSlug = account?.slug ?? "";

  /** Create orchestrator chat task on first open when orchestrator is set but task not yet created. */
  useEffect(() => {
    if (
      !isOpen ||
      !isOrchestratorConfigured ||
      taskId != null ||
      isChatLoading
    ) {
      return;
    }
    ensureChatTask();
  }, [isOpen, isOrchestratorConfigured, taskId, isChatLoading, ensureChatTask]);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Button
        type="button"
        size="icon"
        variant="default"
        className="h-12 w-12 rounded-full shadow-lg"
        aria-label="Open orchestrator chat"
        onClick={setTrue}
      >
        <MessageCircle className="h-5 w-5" />
      </Button>
      <Sheet
        open={isOpen}
        onOpenChange={(open) => (open ? setTrue() : setFalse())}
      >
        <SheetContent
          side="right"
          className="flex w-full max-w-2xl flex-col sm:max-w-3xl"
        >
          <SheetHeader>
            <SheetTitle>Orchestrator Chat</SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex min-h-0 flex-1 flex-col">
            {isAccountLoading ? (
              <Skeleton className="h-full w-full" />
            ) : !isOrchestratorConfigured ? (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Set an orchestrator agent to enable chat.</p>
                {accountSlug ? (
                  <Link
                    href={`/${accountSlug}/settings`}
                    className="text-primary underline"
                  >
                    Go to settings
                  </Link>
                ) : null}
              </div>
            ) : isChatLoading ? (
              <Skeleton className="h-full w-full" />
            ) : error ? (
              <div className="text-sm text-destructive">
                Failed to load chat: {error}
              </div>
            ) : taskId && accountId && accountSlug ? (
              <TaskThread
                taskId={taskId}
                accountSlug={accountSlug}
                accountId={accountId}
                enableMentions={false}
                enableSlashCommands={false}
                useReadByFallback
              />
            ) : (
              <div className="text-sm text-muted-foreground">
                Chat is not available yet.
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
