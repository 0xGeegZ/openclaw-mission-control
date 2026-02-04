"use client";

import Image from "next/image";
import { useRef, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { MessageItem, type ReadByAgent } from "./MessageItem";
import { MessageInput } from "./MessageInput";
import { Skeleton } from "@packages/ui/components/skeleton";
import { MessageSquare, Sparkles } from "lucide-react";

const TYPING_WINDOW_MS = 120_000;

interface TaskThreadProps {
  taskId: Id<"tasks">;
  accountSlug: string;
  accountId: Id<"accounts">;
}

/**
 * Task thread component with messages and input.
 */
export function TaskThread({
  taskId,
  accountSlug: _accountSlug,
  accountId,
}: TaskThreadProps) {
  const messages = useQuery(api.messages.listByTask, { taskId });
  const agents = useQuery(api.agents.list, { accountId });
  const receipts = useQuery(api.notifications.listAgentReceiptsByTask, {
    taskId,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const hasReceiptsInTypingWindow =
    receipts?.some(
      (r) =>
        r.readAt != null &&
        r.deliveredAt == null &&
        now - r.readAt <= TYPING_WINDOW_MS,
    ) ?? false;
  useEffect(() => {
    if (!hasReceiptsInTypingWindow) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasReceiptsInTypingWindow]);

  /** Map agent id -> { name, avatarUrl } for message author display */
  const agentsByAuthorId = useMemo(() => {
    if (!agents) return undefined;
    const map: Record<string, { name: string; avatarUrl?: string }> = {};
    for (const a of agents) {
      map[a._id] = { name: a.name, avatarUrl: a.avatarUrl };
    }
    return map;
  }, [agents]);

  /** Agents currently "typing" (readAt set, deliveredAt empty, within window). */
  const typingAgents = useMemo(() => {
    if (!receipts) return [];
    const agentsMap = new Map<
      string,
      { id: string; name: string; avatarUrl?: string }
    >();
    for (const r of receipts) {
      if (
        r.readAt != null &&
        r.deliveredAt == null &&
        now - r.readAt <= TYPING_WINDOW_MS
      ) {
        const agent = agentsByAuthorId?.[r.recipientId];
        const name = agent?.name ?? "Agent";
        if (!agentsMap.has(r.recipientId)) {
          agentsMap.set(r.recipientId, {
            id: r.recipientId,
            name,
            avatarUrl: agent?.avatarUrl,
          });
        }
      }
    }
    return Array.from(agentsMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [receipts, agentsByAuthorId, now]);

  /** Latest user-authored message (for read receipt). */
  const latestUserMessage = useMemo(() => {
    if (!messages?.length) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].authorType === "user") return messages[i];
    }
    return null;
  }, [messages]);

  /** Agents that have "read" the latest user message (readAt set for that messageId). */
  const readByAgentsForLatestUser = useMemo((): ReadByAgent[] => {
    if (!latestUserMessage || !receipts) return [];
    const agentsMap = new Map<string, ReadByAgent>();
    for (const r of receipts) {
      if (r.messageId === latestUserMessage._id && r.readAt != null) {
        const agent = agentsByAuthorId?.[r.recipientId];
        const name = agent?.name ?? "Agent";
        if (!agentsMap.has(r.recipientId)) {
          agentsMap.set(r.recipientId, {
            id: r.recipientId,
            name,
            avatarUrl: agent?.avatarUrl,
          });
        }
      }
    }
    return Array.from(agentsMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [latestUserMessage, receipts, agentsByAuthorId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages?.length]);

  return (
    <div className="absolute inset-0 flex flex-col bg-background">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {messages === undefined ? (
            <div className="space-y-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-full max-w-md" />
                    <Skeleton className="h-4 w-3/4 max-w-sm" />
                  </div>
                </div>
              ))}
            </div>
          ) : messages.length > 0 ? (
            <div className="space-y-2">
              {messages.map((message, index) => {
                const prevMessage = index > 0 ? messages[index - 1] : null;
                const showDivider =
                  prevMessage && prevMessage.authorType !== message.authorType;
                return (
                  <div key={message._id}>
                    {showDivider && <div className="h-px bg-border/30 my-3" />}
                    <MessageItem
                      message={message}
                      agentsByAuthorId={agentsByAuthorId}
                      readByAgents={
                        latestUserMessage?._id === message._id
                          ? readByAgentsForLatestUser
                          : undefined
                      }
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="relative mb-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10">
                  <MessageSquare className="h-7 w-7 text-primary/60" />
                </div>
                <div className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-3 w-3 text-primary" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                Start the conversation
              </h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-xs leading-relaxed">
                Send a message or use{" "}
                <span className="font-medium text-foreground">@</span> to
                mention an agent and get things started.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Typing indicator - single row above input */}
      {typingAgents.length > 0 && (
        <div className="shrink-0 px-4 py-3 max-w-3xl mx-auto w-full">
          <div className="inline-flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-muted/40 border border-border/30 shadow-sm">
            {/* Agent avatars */}
            <div className="flex items-center -space-x-2">
              {typingAgents.slice(0, 3).map((agent) => (
                <div
                  key={agent.id}
                  className="relative h-7 w-7 rounded-full ring-2 ring-background overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5 shadow-sm"
                  title={agent.name}
                >
                  {agent.avatarUrl ? (
                    <Image
                      src={agent.avatarUrl}
                      alt={agent.name}
                      width={28}
                      height={28}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-[11px] font-semibold text-primary">
                      {agent.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              ))}
              {typingAgents.length > 3 && (
                <div className="h-7 w-7 rounded-full bg-muted ring-2 ring-background flex items-center justify-center shadow-sm">
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    +{typingAgents.length - 3}
                  </span>
                </div>
              )}
            </div>

            {/* Animated typing dots */}
            <div className="flex items-center gap-1 px-1">
              <span className="h-2 w-2 rounded-full bg-primary/70 animate-typing-dot" />
              <span className="h-2 w-2 rounded-full bg-primary/70 animate-typing-dot-delay-1" />
              <span className="h-2 w-2 rounded-full bg-primary/70 animate-typing-dot-delay-2" />
            </div>

            {/* Typing text */}
            <span className="text-sm text-muted-foreground font-medium">
              {typingAgents.length === 1
                ? `${typingAgents[0].name} is typing`
                : `${typingAgents.length} agents typing`}
            </span>
          </div>
        </div>
      )}

      {/* Input area - sticky at bottom */}
      <div className="shrink-0 w-full">
        <div className="max-w-3xl mx-auto">
          <MessageInput
            taskId={taskId}
            showSuggestions={messages !== undefined && messages.length === 0}
          />
        </div>
      </div>
    </div>
  );
}
