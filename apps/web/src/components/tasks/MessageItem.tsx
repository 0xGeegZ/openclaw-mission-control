"use client";

import { useState } from "react";
import { Doc } from "@packages/backend/convex/_generated/dataModel";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@packages/ui/components/avatar";
import { Badge } from "@packages/ui/components/badge";
import { Textarea } from "@packages/ui/components/textarea";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@clerk/nextjs";
import { useAccount } from "@/lib/hooks/useAccount";
import {
  MoreVertical,
  Trash2,
  User,
  Bot,
  Edit2,
  Check,
  X,
  Loader2,
  Sparkles,
  Copy,
  CheckCheck,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@packages/ui/components/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@packages/ui/components/alert-dialog";
import { Button } from "@packages/ui/components/button";
import { useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { toast } from "sonner";
import { cn } from "@packages/ui/lib/utils";
import { Streamdown } from "streamdown";
import React from "react";

/**
 * Renders message content with inline styled @mentions.
 * Replaces @name patterns with styled span elements.
 * Uses inline spans for text fragments to keep mentions on the same line.
 */
function renderContentWithMentions(
  content: string,
  mentions?: Array<{ name: string; id?: string }>
): React.ReactNode {
  if (!mentions || mentions.length === 0) {
    return <Streamdown>{content}</Streamdown>;
  }

  // Create a map of lowercase mention names for case-insensitive matching
  const mentionMap = new Map(
    mentions.map((m) => [m.name.toLowerCase(), m])
  );

  // Regex to find @mentions (word characters after @)
  const mentionRegex = /@(\w+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    const mentionName = match[1];
    const mention = mentionMap.get(mentionName.toLowerCase());

    // Add text before this match as inline span
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      parts.push(
        <span key={`text-${lastIndex}`}>{textBefore}</span>
      );
    }

    if (mention) {
      // Render styled mention badge inline
      parts.push(
        <span
          key={`mention-${match.index}`}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded-md bg-primary/10 text-primary font-medium text-sm hover:bg-primary/15 transition-colors cursor-default align-middle"
          title={`Mentioned: ${mention.name}`}
        >
          @{mention.name}
        </span>
      );
    } else {
      // Not a valid mention, render as plain inline text
      parts.push(
        <span key={`text-${match.index}`}>{match[0]}</span>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last match as inline span
  if (lastIndex < content.length) {
    const textAfter = content.slice(lastIndex);
    parts.push(<span key={`text-${lastIndex}`}>{textAfter}</span>);
  }

  // Wrap in a span to ensure inline flow
  return parts.length > 0 ? <span>{parts}</span> : <Streamdown>{content}</Streamdown>;
}

/** Lookup for agent author display (name, optional avatar). */
export type AgentsByAuthorId = Record<
  string,
  { name: string; avatarUrl?: string }
>;

/** Agent info for read receipts display */
export interface ReadByAgent {
  id: string;
  name: string;
  avatarUrl?: string;
}

interface MessageItemProps {
  message: Doc<"messages">;
  /** Map of agent id -> display info; used to show which agent wrote each message */
  agentsByAuthorId?: AgentsByAuthorId;
  /** Agents that have "read" this message (for user-authored messages). */
  readByAgents?: ReadByAgent[];
}

/**
 * Single message item in thread.
 * When authorType is "agent", shows the agent's name (and avatar if provided) so multiple agents are distinguishable.
 * For user messages, optional readByAgents shows "Seen by …" when agents have started processing the message.
 */
export function MessageItem({
  message,
  agentsByAuthorId,
  readByAgents,
}: MessageItemProps) {
  const { userId } = useAuth();
  const { isAdmin } = useAccount();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isUpdating, setIsUpdating] = useState(false);
  const [copied, setCopied] = useState(false);
  const deleteMessage = useMutation(api.messages.remove);
  const updateMessage = useMutation(api.messages.update);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isAuthor = message.authorType === "user" && message.authorId === userId;
  const isAgent = message.authorType === "agent";
  const canDelete = isAuthor || isAdmin;
  const agentAuthor =
    isAgent && agentsByAuthorId
      ? agentsByAuthorId[message.authorId]
      : undefined;
  const authorName =
    message.authorType === "user"
      ? "You"
      : agentAuthor
        ? agentAuthor.name
        : "Agent";
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteMessage({ messageId: message._id });
      toast.success("Message deleted");
      setShowDeleteConfirm(false);
    } catch {
      toast.error("Failed to delete message");
    } finally {
      setIsDeleting(false);
    }
  };
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy message");
    }
  };
  const handleEdit = () => {
    setEditContent(message.content);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditContent(message.content);
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!editContent.trim() || editContent.trim() === message.content) {
      handleCancelEdit();
      return;
    }

    setIsUpdating(true);
    try {
      await updateMessage({
        messageId: message._id,
        content: editContent.trim(),
      });
      toast.success("Message updated");
      setIsEditing(false);
    } catch {
      toast.error("Failed to update message");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div
      className={cn(
        "flex gap-3.5 group rounded-2xl p-4 -mx-2 transition-all duration-200",
        isAgent
          ? "bg-gradient-to-br from-muted/40 to-muted/20 border border-border/30"
          : "hover:bg-muted/20",
      )}
    >
      <Avatar
        className={cn(
          "h-9 w-9 shrink-0 ring-2 ring-background shadow-md",
          isAgent
            ? "bg-gradient-to-br from-primary/15 to-primary/5"
            : "bg-gradient-to-br from-secondary to-secondary/80",
        )}
      >
        {isAgent && agentAuthor?.avatarUrl ? (
          <>
            <AvatarImage src={agentAuthor.avatarUrl} alt={authorName} />
            <AvatarFallback className="sr-only">{authorName}</AvatarFallback>
          </>
        ) : (
          <AvatarFallback className="bg-transparent">
            {isAgent ? (
              <Bot className="h-4 w-4 text-primary" />
            ) : (
              <User className="h-4 w-4 text-secondary-foreground" />
            )}
          </AvatarFallback>
        )}
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-semibold text-sm text-foreground">
            {authorName}
          </span>
          {isAgent && (
            <Badge
              variant="secondary"
              className="text-[9px] px-1.5 py-0 h-[18px] bg-primary/10 text-primary border border-primary/20 gap-0.5 font-medium"
            >
              <Sparkles className="h-2 w-2" />
              AI
            </Badge>
          )}
          <span className="text-[11px] text-muted-foreground/60 tabular-nums">
            {formatDistanceToNow(message.createdAt, { addSuffix: true })}
          </span>
          {message.editedAt && (
            <span className="text-[10px] text-muted-foreground/50 italic">
              edited
            </span>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-3">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[80px] resize-none text-sm rounded-lg"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") handleCancelEdit();
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSaveEdit();
                }
              }}
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleSaveEdit}
                disabled={isUpdating || !editContent.trim()}
                className="h-8"
              >
                {isUpdating ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                )}
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancelEdit}
                disabled={isUpdating}
                className="h-8"
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Cancel
              </Button>
              <span className="text-[11px] text-muted-foreground/70 ml-auto">
                <kbd className="px-1 py-0.5 bg-muted rounded border text-[10px]">
                  Cmd+Enter
                </kbd>{" "}
                to save
              </span>
            </div>
          </div>
        ) : (
          <>
            <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 prose-p:leading-relaxed prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-code:text-primary prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-headings:text-foreground prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
              {renderContentWithMentions(message.content, message.mentions)}
            </div>

            {message.authorType === "user" &&
              readByAgents &&
              readByAgents.length > 0 && (
                <div className="mt-3 flex items-center gap-2">
                  <CheckCheck className="h-3.5 w-3.5 text-primary/50" />
                  <div className="flex items-center -space-x-1.5">
                    {readByAgents.slice(0, 4).map((agent) => (
                      <Avatar
                        key={agent.id}
                        className="h-5 w-5 ring-[1.5px] ring-background shadow-sm"
                        title={`Seen by ${agent.name}`}
                      >
                        {agent.avatarUrl ? (
                          <AvatarImage src={agent.avatarUrl} alt={agent.name} />
                        ) : null}
                        <AvatarFallback className="bg-gradient-to-br from-primary/15 to-primary/5 text-primary text-[8px] font-semibold">
                          {agent.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                    {readByAgents.length > 4 && (
                      <div className="h-5 w-5 rounded-full bg-muted/80 ring-[1.5px] ring-background flex items-center justify-center shadow-sm">
                        <span className="text-[8px] font-semibold text-muted-foreground">
                          +{readByAgents.length - 4}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground/50 font-medium">
                    Seen by {readByAgents.length === 1 ? readByAgents[0].name : `${readByAgents.length} agents`}
                  </span>
                </div>
              )}
          </>
        )}
      </div>

      {!isEditing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-all duration-200 rounded-lg hover:bg-muted"
            >
              <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="sr-only">Message options</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32 rounded-xl">
            <DropdownMenuItem onClick={handleCopy} className="gap-2 text-sm rounded-lg">
              {copied ? (
                <CheckCheck className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied!" : "Copy"}
            </DropdownMenuItem>
            {isAuthor && (
              <DropdownMenuItem onClick={handleEdit} className="gap-2 text-sm rounded-lg">
                <Edit2 className="h-3.5 w-3.5" />
                Edit
              </DropdownMenuItem>
            )}
            {canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-destructive focus:text-destructive gap-2 text-sm rounded-lg"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Message</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this message? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-3 px-1">
            <div className="p-3 rounded-lg bg-muted/50 border border-border/50 text-sm text-muted-foreground line-clamp-3">
              {message.content}
            </div>
          </div>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={isDeleting} className="rounded-lg">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90 rounded-lg gap-2"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
