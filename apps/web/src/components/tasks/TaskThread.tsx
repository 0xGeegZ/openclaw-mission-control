"use client";

import Image from "next/image";
import { useRef, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Doc, Id } from "@packages/backend/convex/_generated/dataModel";
import { TYPING_WINDOW_MS } from "@packages/shared";
import { MessageItem, type ReadByAgent } from "./MessageItem";
import { MessageInput } from "./MessageInput";
import { Skeleton } from "@packages/ui/components/skeleton";
import { Bot, MessageSquare, Sparkles } from "lucide-react";
import { AGENT_ICON_MAP } from "@/lib/agentIcons";

/**
 * Build display-ready agent info for agent mentions on a message.
 */
function getMentionedAgentsForMessage(
  message: Doc<"messages"> | null,
  agentsByAuthorId?: Record<
    string,
    { name: string; avatarUrl?: string; icon?: string }
  >,
): ReadByAgent[] {
  if (!message?.mentions?.length) return [];
  const agentsMap = new Map<string, ReadByAgent>();
  for (const mention of message.mentions) {
    if (mention.type !== "agent") continue;
    if (!mention.id) continue;
    const agent = agentsByAuthorId?.[mention.id];
    const name = agent?.name ?? mention.name ?? "Agent";
    if (!agentsMap.has(mention.id)) {
      agentsMap.set(mention.id, {
        id: mention.id,
        name,
        avatarUrl: agent?.avatarUrl,
        icon: agent?.icon,
      });
    }
  }
  return Array.from(agentsMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/**
 * Resolve the latest user-authored message and its index within the thread.
 */
function getLatestUserMessageInfo(
  messages: Doc<"messages">[] | undefined,
): { message: Doc<"messages">; index: number } | null {
  if (!messages?.length) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.authorType === "user") {
      return { message, index: i };
    }
  }
  return null;
}

interface TaskThreadProps {
  taskId: Id<"tasks">;
  accountSlug: string;
  accountId: Id<"accounts">;
  /** Enable @mention autocomplete and parsing. */
  enableMentions?: boolean;
  /** Enable slash command autocomplete and parsing. */
  enableSlashCommands?: boolean;
  /** Use agent replies as a fallback for read/typing indicators. */
  useReadByFallback?: boolean;
}

/**
 * Task thread component with messages and input.
 */
export function TaskThread({
  taskId,
  accountSlug: _accountSlug,
  accountId,
  enableMentions = true,
  enableSlashCommands = true,
  useReadByFallback = false,
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

  /** Map agent id -> { name, avatarUrl, icon } for message author display */
  const agentsByAuthorId = useMemo(() => {
    if (!agents) return undefined;
    const map: Record<
      string,
      { name: string; avatarUrl?: string; icon?: string }
    > = {};
    for (const a of agents) {
      map[a._id] = { name: a.name, avatarUrl: a.avatarUrl, icon: a.icon };
    }
    return map;
  }, [agents]);

  /** Agents currently "typing" (readAt set, deliveredAt empty, within window). */
  const typingAgents = useMemo(() => {
    if (!receipts) return [];
    const agentsMap = new Map<
      string,
      { id: string; name: string; avatarUrl?: string; icon?: string }
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
            icon: agent?.icon,
          });
        }
      }
    }
    return Array.from(agentsMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [receipts, agentsByAuthorId, now]);

  /** Latest user-authored message (for read receipt/typing fallback). */
  const latestUserMessageInfo = getLatestUserMessageInfo(messages);
  const latestUserMessage = latestUserMessageInfo?.message ?? null;
  const latestUserMessageIndex = latestUserMessageInfo?.index ?? -1;

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
            icon: agent?.icon,
          });
        }
      }
    }
    return Array.from(agentsMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [latestUserMessage, receipts, agentsByAuthorId]);

  const agentsAfterLatestUser = useMemo((): ReadByAgent[] => {
    if (!messages?.length || latestUserMessageIndex < 0) return [];
    const agentsMap = new Map<string, ReadByAgent>();
    for (const message of messages.slice(latestUserMessageIndex + 1)) {
      if (message.authorType !== "agent") continue;
      if (agentsMap.has(message.authorId)) continue;
      const agent = agentsByAuthorId?.[message.authorId];
      const name = agent?.name ?? "Agent";
      agentsMap.set(message.authorId, {
        id: message.authorId,
        name,
        avatarUrl: agent?.avatarUrl,
        icon: agent?.icon,
      });
    }
    return Array.from(agentsMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [agentsByAuthorId, latestUserMessageIndex, messages]);

  const fallbackReadByAgents = useMemo(
    () => (useReadByFallback ? agentsAfterLatestUser : []),
    [agentsAfterLatestUser, useReadByFallback],
  );

  const effectiveReadByAgents =
    readByAgentsForLatestUser.length > 0
      ? readByAgentsForLatestUser
      : fallbackReadByAgents;

  const mentionedAgentsForLatestUser = useMemo(
    () => getMentionedAgentsForMessage(latestUserMessage, agentsByAuthorId),
    [agentsByAuthorId, latestUserMessage],
  );

  const fallbackTypingAgents = useMemo((): ReadByAgent[] => {
    if (!useReadByFallback) return [];
    if (!latestUserMessage) return [];
    if (mentionedAgentsForLatestUser.length === 0) return [];
    if (agentsAfterLatestUser.length > 0) return [];
    if (now - latestUserMessage.createdAt > TYPING_WINDOW_MS) return [];
    return mentionedAgentsForLatestUser;
  }, [
    agentsAfterLatestUser.length,
    latestUserMessage,
    mentionedAgentsForLatestUser,
    now,
    useReadByFallback,
  ]);

  const effectiveTypingAgents =
    typingAgents.length > 0 ? typingAgents : fallbackTypingAgents;

  const hasTypingIndicatorsActive =
    hasReceiptsInTypingWindow || fallbackTypingAgents.length > 0;

  /** Ensure typing indicator never renders before "Seen by". */
  const shouldShowTypingIndicator =
    effectiveTypingAgents.length > 0 && effectiveReadByAgents.length > 0;

  useEffect(() => {
    if (!hasTypingIndicatorsActive) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasTypingIndicatorsActive]);

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
                          ? effectiveReadByAgents
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
      {shouldShowTypingIndicator && (
        <div className="shrink-0 px-4 py-3 max-w-3xl mx-auto w-full">
          <div className="inline-flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-muted/40 border border-border/30 shadow-sm">
            {/* Agent avatars */}
            <div className="flex items-center -space-x-2">
              {effectiveTypingAgents.slice(0, 3).map((agent) => (
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
                    (() => {
                      const FallbackIcon =
                        (agent.icon && AGENT_ICON_MAP[agent.icon]) || Bot;
                      return (
                        <div className="h-full w-full flex items-center justify-center text-primary">
                          <FallbackIcon className="h-4 w-4" />
                        </div>
                      );
                    })()
                  )}
                </div>
              ))}
              {effectiveTypingAgents.length > 3 && (
                <div className="h-7 w-7 rounded-full bg-muted ring-2 ring-background flex items-center justify-center shadow-sm">
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    +{effectiveTypingAgents.length - 3}
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
              {effectiveTypingAgents.length === 1
                ? `${effectiveTypingAgents[0].name} is typing`
                : `${effectiveTypingAgents.length} agents typing`}
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
            enableMentions={enableMentions}
            enableSlashCommands={enableSlashCommands}
          />
        </div>
      </div>
    </div>
  );
}
