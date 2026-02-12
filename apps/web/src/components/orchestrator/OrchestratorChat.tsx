"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { MessageCircle, Maximize2, Minimize2, X, Bot, Settings } from "lucide-react";
import Link from "next/link";
import { useBoolean } from "usehooks-ts";
import { Button } from "@packages/ui/components/button";
import { Skeleton } from "@packages/ui/components/skeleton";
import { TaskThread } from "@/components/tasks/TaskThread";
import { useAccount } from "@/lib/hooks/useAccount";
import { useOrchestratorChat } from "@/lib/hooks/useOrchestratorChat";
import { cn } from "@packages/ui/lib/utils";

/**
 * Floating chat bubble that opens an inline chat panel anchored
 * to the bottom-right corner -- replaces the old Sheet-based approach
 * for a friendlier, less intrusive experience.
 */
export function OrchestratorChat() {
  const { account, accountId, isLoading: isAccountLoading } = useAccount();
  const { value: isOpen, setTrue: open, setFalse: close } = useBoolean(false);
  const {
    taskId,
    isLoading: isChatLoading,
    error,
    isOrchestratorConfigured,
    ensureChatTask,
  } = useOrchestratorChat();

  const [isExpanded, setIsExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const accountSlug = account?.slug ?? "";

  const toggle = useCallback(() => {
    if (isOpen) {
      close();
      setIsExpanded(false);
    } else {
      open();
    }
  }, [isOpen, open, close]);

  /** Create orchestrator chat task on first open. */
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

  /** Close on Escape. */
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {/* ---------- Chat panel ---------- */}
      <div
        ref={panelRef}
        className={cn(
          "flex flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl transition-all duration-300 ease-out origin-bottom-right",
          isOpen
            ? "pointer-events-auto scale-100 opacity-100 translate-y-0"
            : "pointer-events-none h-0 scale-95 opacity-0 translate-y-2",
          isOpen && isExpanded
            ? "w-[min(680px,calc(100vw-2.5rem))] h-[min(85vh,calc(100vh-5rem))]"
            : "w-[min(420px,calc(100vw-2.5rem))]",
          isOpen && !isExpanded && "h-[min(600px,calc(100vh-7rem))]",
        )}
        role="dialog"
        aria-label="Orchestrator Chat"
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 shrink-0">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
            <Bot className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xs font-semibold text-foreground leading-none">
              Orchestrator
            </h2>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">
              {isOrchestratorConfigured
                ? "AI assistant ready"
                : "Not configured"}
            </p>
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground"
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-label={isExpanded ? "Reduce chat size" : "Expand chat size"}
            >
              {isExpanded ? (
                <Minimize2 className="h-3 w-3" />
              ) : (
                <Maximize2 className="h-3 w-3" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-md text-muted-foreground hover:text-destructive"
              onClick={() => {
                close();
                setIsExpanded(false);
              }}
              aria-label="Close chat"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="relative flex-1 min-h-0">
          {isAccountLoading ? (
            <div className="flex flex-col gap-4 p-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : !isOrchestratorConfigured ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                <Settings className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  No orchestrator configured
                </p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Set an orchestrator agent in your workspace settings to enable
                  this chat.
                </p>
              </div>
              {accountSlug && (
                <Link
                  href={`/${accountSlug}/settings`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  onClick={close}
                >
                  <Settings className="h-3.5 w-3.5" />
                  Go to settings
                </Link>
              )}
            </div>
          ) : isChatLoading ? (
            <div className="flex flex-col gap-4 p-4">
              <div className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
              <div className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
                <X className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Something went wrong
                </p>
                <p className="text-xs text-destructive mt-1">{error}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => ensureChatTask()}
              >
                Try again
              </Button>
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
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Chat is not available yet.
            </div>
          )}
        </div>
      </div>

      {/* ---------- Floating Action Button ---------- */}
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "group relative flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-300",
          isOpen
            ? "bg-muted text-muted-foreground hover:bg-muted/80 scale-90"
            : "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 hover:shadow-xl",
        )}
        aria-label={isOpen ? "Close orchestrator chat" : "Open orchestrator chat"}
        aria-expanded={isOpen}
      >
        <MessageCircle
          className={cn(
            "h-5 w-5 transition-all duration-300",
            isOpen && "rotate-90 scale-0 opacity-0 absolute",
            !isOpen && "rotate-0 scale-100 opacity-100",
          )}
        />
        <X
          className={cn(
            "h-5 w-5 transition-all duration-300",
            !isOpen && "-rotate-90 scale-0 opacity-0 absolute",
            isOpen && "rotate-0 scale-100 opacity-100",
          )}
        />
        {/* Pulse ring when closed */}
        {!isOpen && (
          <span className="absolute inset-0 rounded-full animate-ping bg-primary/20 pointer-events-none" />
        )}
      </button>
    </div>
  );
}
