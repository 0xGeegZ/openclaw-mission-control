"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id, Doc } from "@packages/backend/convex/_generated/dataModel";
import { Textarea } from "@packages/ui/components/textarea";
import { Button } from "@packages/ui/components/button";
import {
  Send,
  Loader2,
  Bot,
  Users,
  Sparkles,
  Paperclip,
  X,
  FileText,
  ArrowRight,
  FileCheck,
  MessageSquareText,
  ListChecks,
  Slash,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@packages/ui/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@packages/ui/components/tooltip";
import { useAccount } from "@/lib/hooks/useAccount";
import {
  SLASH_COMMANDS,
  parseSlashCommand,
} from "@/components/tasks/slashCommands";

interface AttachedFile {
  id: string;
  file: File;
  preview?: string;
}

interface MessageInputProps {
  taskId: Id<"tasks">;
  showSuggestions?: boolean;
  onSuggestionClick?: (suggestion: string) => void;
  /** Enable @mention autocomplete and parsing. */
  enableMentions?: boolean;
  /** Enable slash command autocomplete and parsing. */
  enableSlashCommands?: boolean;
}

type MentionOption =
  | { type: "all"; label: string; description: string }
  | { type: "agent"; agent: Doc<"agents"> };

/**
 * Message input with send button, @ mention autocomplete, and / slash commands.
 */
export function MessageInput({
  taskId,
  showSuggestions = false,
  onSuggestionClick,
  enableMentions = true,
  enableSlashCommands = true,
}: MessageInputProps) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(
    null,
  );
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const slashDropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { accountId } = useAccount();
  const agents = useQuery(
    api.agents.list,
    enableMentions && accountId ? { accountId } : "skip",
  );

  const createMessage = useMutation(api.messages.create);
  const pauseAgentsOnTask = useMutation(api.tasks.pauseAgentsOnTask);
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
  const registerUpload = useMutation(api.messages.registerUpload);

  const [showSlashDropdown, setShowSlashDropdown] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashStartIndex, setSlashStartIndex] = useState<number | null>(null);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);

  // Loading state for agents
  const isLoadingAgents = agents === undefined;

  // Filter agents based on mention query
  const filteredAgents = useMemo((): MentionOption[] => {
    const query = mentionQuery.toLowerCase();

    // Add "all" option at the top
    const allOption: MentionOption = {
      type: "all",
      label: "all",
      description: "Mention all agents",
    };

    // If still loading, return just the "all" option if it matches
    if (!agents) {
      if ("all".includes(query)) {
        return [allOption];
      }
      return [];
    }

    const agentOptions: MentionOption[] = agents
      .filter(
        (agent) =>
          agent.name.toLowerCase().includes(query) ||
          agent.slug.toLowerCase().includes(query) ||
          agent.role.toLowerCase().includes(query),
      )
      .map((agent) => ({ type: "agent" as const, agent }));

    // Include "all" if query matches
    const options: MentionOption[] = [];
    if ("all".includes(query)) {
      options.push(allOption);
    }
    options.push(...agentOptions);

    return options;
  }, [agents, mentionQuery]);

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [filteredAgents.length]);

  const filteredSlashCommands = useMemo(() => {
    const q = slashQuery.toLowerCase();
    return SLASH_COMMANDS.filter(
      (cmd) =>
        cmd.label.toLowerCase().startsWith(q) ||
        cmd.label.toLowerCase().includes(q),
    );
  }, [slashQuery]);

  useEffect(() => {
    setSelectedSlashIndex(0);
  }, [filteredSlashCommands.length]);

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const cursorPos = e.target.selectionStart || 0;
      setContent(value);

      const textBeforeCursor = value.slice(0, cursorPos);
      const slashMatch = enableSlashCommands
        ? textBeforeCursor.match(/\/(\w*)$/)
        : null;
      const atMatch = enableMentions ? textBeforeCursor.match(/@(\w*)$/) : null;

      if (slashMatch) {
        setShowSlashDropdown(true);
        setSlashQuery(slashMatch[1]);
        setSlashStartIndex(cursorPos - slashMatch[0].length);
        setShowMentionDropdown(false);
        setMentionQuery("");
        setMentionStartIndex(null);
      } else {
        if (enableSlashCommands) {
          setShowSlashDropdown(false);
          setSlashQuery("");
          setSlashStartIndex(null);
        }

        if (atMatch) {
          setShowMentionDropdown(true);
          setMentionQuery(atMatch[1]);
          setMentionStartIndex(cursorPos - atMatch[0].length);
        } else if (enableMentions) {
          setShowMentionDropdown(false);
          setMentionQuery("");
          setMentionStartIndex(null);
        }
      }
    },
    [enableMentions, enableSlashCommands],
  );

  const insertMention = useCallback(
    (mentionText: string) => {
      if (mentionStartIndex === null) return;

      const beforeMention = content.slice(0, mentionStartIndex);
      const afterCursor = content.slice(
        mentionStartIndex + mentionQuery.length + 1, // +1 for the @
      );

      const newContent = `${beforeMention}@${mentionText} ${afterCursor}`;
      setContent(newContent);
      setShowMentionDropdown(false);
      setMentionQuery("");
      setMentionStartIndex(null);

      // Focus back on textarea
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newCursorPos = beforeMention.length + mentionText.length + 2; // +2 for @ and space
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    },
    [content, mentionStartIndex, mentionQuery.length],
  );

  const handleMentionSelect = useCallback(
    (option: MentionOption) => {
      if (option.type === "all") {
        insertMention("all");
      } else {
        insertMention(option.agent.slug);
      }
    },
    [insertMention],
  );

  /** Clears input and both dropdowns, then refocuses the textarea. Use after successful submit. */
  const clearInputAndFocus = useCallback(() => {
    setContent("");
    setShowMentionDropdown(false);
    setShowSlashDropdown(false);
    textareaRef.current?.focus();
  }, []);

  const insertSlashCommand = useCallback(
    (commandLabel: string) => {
      if (slashStartIndex === null) return;

      const beforeSlash = content.slice(0, slashStartIndex);
      const afterCursor = content.slice(
        slashStartIndex + slashQuery.length + 1, // +1 for the /
      );

      const newContent = `${beforeSlash}/${commandLabel} ${afterCursor}`;
      setContent(newContent);
      setShowSlashDropdown(false);
      setSlashQuery("");
      setSlashStartIndex(null);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newCursorPos = beforeSlash.length + commandLabel.length + 2; // / + label + space
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    },
    [content, slashStartIndex, slashQuery.length],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || isSubmitting) return;

    const slashParsed = enableSlashCommands ? parseSlashCommand(trimmed) : null;
    if (slashParsed?.command === "stop") {
      setIsSubmitting(true);
      try {
        const result = await pauseAgentsOnTask({ taskId });
        if (result?.alreadyBlocked) {
          toast.info("Task is already paused.");
        } else {
          toast.success("Agents paused", {
            description: "All agents on this task have been paused.",
          });
        }
        clearInputAndFocus();
      } catch (error) {
        toast.error("Failed to pause agents", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setIsSubmitting(true);
    try {
      // Upload files if any are attached
      let attachments: Array<{
        storageId: Id<"_storage">;
        name: string;
        type: string;
        size: number;
      }> | undefined;

      if (attachedFiles.length > 0) {
        attachments = [];
        for (const attachedFile of attachedFiles) {
          try {
            // 1. Get upload URL
            const uploadUrl = await generateUploadUrl({ taskId });
            
            // 2. Upload file to Convex storage
            const result = await fetch(uploadUrl, {
              method: "POST",
              headers: { "Content-Type": attachedFile.file.type },
              body: attachedFile.file,
            });

            if (!result.ok) {
              throw new Error(`Upload failed for ${attachedFile.file.name}`);
            }

            const { storageId } = await result.json();

            // 3. Register upload
            await registerUpload({ taskId, storageId });

            // 4. Add to attachments array
            attachments.push({
              storageId,
              name: attachedFile.file.name,
              type: attachedFile.file.type,
              size: attachedFile.file.size,
            });
          } catch (uploadError) {
            toast.error(`Failed to upload ${attachedFile.file.name}`, {
              description: uploadError instanceof Error ? uploadError.message : "Unknown error",
            });
            throw uploadError; // Stop message creation if upload fails
          }
        }
      }

      // Create message with attachments
      await createMessage({
        taskId,
        content: trimmed,
        attachments,
      });

      // Clear all state on success
      setAttachedFiles([]);
      clearInputAndFocus();
    } catch (error) {
      toast.error("Failed to send message", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      enableSlashCommands &&
      showSlashDropdown &&
      filteredSlashCommands.length > 0
    ) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSlashIndex((prev) =>
          prev < filteredSlashCommands.length - 1 ? prev + 1 : 0,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSlashIndex((prev) =>
          prev > 0 ? prev - 1 : filteredSlashCommands.length - 1,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const safeSlashIndex = Math.min(
          selectedSlashIndex,
          filteredSlashCommands.length - 1,
        );
        const cmd = filteredSlashCommands[safeSlashIndex];
        if (cmd) insertSlashCommand(cmd.label);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowSlashDropdown(false);
        return;
      }
    }

    // Handle mention dropdown navigation
    if (enableMentions && showMentionDropdown && filteredAgents.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedMentionIndex((prev) =>
          prev < filteredAgents.length - 1 ? prev + 1 : 0,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedMentionIndex((prev) =>
          prev > 0 ? prev - 1 : filteredAgents.length - 1,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const safeIndex = Math.min(
          selectedMentionIndex,
          filteredAgents.length - 1,
        );
        const option = filteredAgents[safeIndex];
        if (option) handleMentionSelect(option);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentionDropdown(false);
        return;
      }
    }

    // Submit on Enter (without Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowMentionDropdown(false);
        setShowSlashDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // File attachment handlers
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      const newAttachments: AttachedFile[] = files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined,
      }));
      setAttachedFiles((prev) => [...prev, ...newAttachments]);
      // Reset input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachedFiles((prev) => {
      const removed = prev.find((f) => f.id === id);
      if (removed?.preview) {
        URL.revokeObjectURL(removed.preview);
      }
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  // Cleanup previews on unmount
  useEffect(() => {
    return () => {
      attachedFiles.forEach((f) => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSuggestionSelect = useCallback(
    (suggestion: string) => {
      setContent(suggestion);
      onSuggestionClick?.(suggestion);
      textareaRef.current?.focus();
    },
    [onSuggestionClick],
  );

  // Suggested prompts with icons
  const suggestions = [
    { text: "What are the next steps for this task?", icon: ArrowRight },
    { text: "Summarize the current status", icon: FileCheck },
    { text: "Help me draft a response", icon: MessageSquareText },
    { text: "List all action items", icon: ListChecks },
  ];

  // Scroll selected item into view
  useEffect(() => {
    if (showMentionDropdown && dropdownRef.current) {
      const selectedElement = dropdownRef.current.querySelector(
        `[data-index="${selectedMentionIndex}"]`,
      );
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedMentionIndex, showMentionDropdown]);

  useEffect(() => {
    if (showSlashDropdown && slashDropdownRef.current) {
      const selectedElement = slashDropdownRef.current.querySelector(
        `[data-slash-index="${selectedSlashIndex}"]`,
      );
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedSlashIndex, showSlashDropdown]);

  return (
    <TooltipProvider>
      <div ref={containerRef} className="border-t bg-card/80 backdrop-blur-sm">
        {/* Suggestion chips - shown when thread is empty */}
        {showSuggestions && !content && (
          <div className="px-4 pt-4 pb-2">
            <div className="grid grid-cols-2 gap-2">
              {suggestions.map((suggestion, index) => {
                const Icon = suggestion.icon;
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleSuggestionSelect(suggestion.text)}
                    className={cn(
                      "group/suggestion flex items-start gap-3 px-4 py-3 text-left text-sm rounded-xl transition-all duration-200",
                      "border border-border/50 hover:border-primary/30",
                      "bg-background hover:bg-primary/5",
                      "text-foreground/70 hover:text-foreground",
                    )}
                  >
                    <div className="shrink-0 h-8 w-8 rounded-lg bg-muted/50 group-hover/suggestion:bg-primary/10 flex items-center justify-center transition-colors">
                      <Icon className="h-4 w-4 text-muted-foreground group-hover/suggestion:text-primary transition-colors" />
                    </div>
                    <span className="pt-1 leading-snug">{suggestion.text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4">
          <div className="relative">
            {/* Slash command dropdown - positioned above input */}
            {enableSlashCommands && showSlashDropdown && (
              <div
                ref={slashDropdownRef}
                className="absolute bottom-full left-0 right-0 mb-2 bg-popover border border-border rounded-xl shadow-xl overflow-hidden z-50 max-w-sm"
              >
                <div className="px-3 py-2.5 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Slash className="h-3.5 w-3.5 text-primary" />
                    <p className="text-xs font-medium text-foreground">
                      Slash command
                    </p>
                  </div>
                </div>

                {filteredSlashCommands.length > 0 ? (
                  <div
                    className="max-h-64 overflow-y-auto p-1"
                    role="listbox"
                    aria-label="Slash command suggestions"
                  >
                    {filteredSlashCommands.map((cmd, index) => (
                      <button
                        key={cmd.id}
                        type="button"
                        role="option"
                        aria-selected={index === selectedSlashIndex}
                        data-slash-index={index}
                        onClick={() => insertSlashCommand(cmd.label)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all rounded-lg",
                          index === selectedSlashIndex
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent",
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-full shrink-0",
                            index === selectedSlashIndex
                              ? "bg-primary-foreground/20"
                              : "bg-muted",
                          )}
                        >
                          <Slash
                            className={cn(
                              "h-4 w-4",
                              index === selectedSlashIndex
                                ? "text-primary-foreground"
                                : "text-muted-foreground",
                            )}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">/{cmd.label}</p>
                          <p
                            className={cn(
                              "text-xs truncate",
                              index === selectedSlashIndex
                                ? "text-primary-foreground/70"
                                : "text-muted-foreground",
                            )}
                          >
                            {cmd.description}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      No matching commands
                    </p>
                  </div>
                )}

                <div className="px-3 py-2 border-t border-border bg-muted/30">
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 bg-background rounded border font-mono">
                        Tab
                      </kbd>
                      <span>select</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1 py-0.5 bg-background rounded border font-mono">
                        Esc
                      </kbd>
                      <span>close</span>
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Mention Autocomplete Dropdown - positioned above input */}
            {enableMentions && showMentionDropdown && (
              <div
                ref={dropdownRef}
                className="absolute bottom-full left-0 right-0 mb-2 bg-popover border border-border rounded-xl shadow-xl overflow-hidden z-50 max-w-sm"
              >
                <div className="px-3 py-2.5 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <p className="text-xs font-medium text-foreground">
                      Mention an agent
                    </p>
                  </div>
                </div>

                {isLoadingAgents ? (
                  <div className="px-3 py-6 flex flex-col items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      Loading agents...
                    </p>
                  </div>
                ) : filteredAgents.length > 0 ? (
                  <div
                    className="max-h-64 overflow-y-auto p-1"
                    role="listbox"
                    aria-label="Agent suggestions"
                  >
                    {filteredAgents.map((option, index) => (
                      <button
                        key={option.type === "all" ? "all" : option.agent._id}
                        type="button"
                        role="option"
                        aria-selected={index === selectedMentionIndex}
                        data-index={index}
                        onClick={() => handleMentionSelect(option)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all rounded-lg",
                          index === selectedMentionIndex
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent",
                        )}
                      >
                        {option.type === "all" ? (
                          <>
                            <div
                              className={cn(
                                "flex h-9 w-9 items-center justify-center rounded-full shrink-0",
                                index === selectedMentionIndex
                                  ? "bg-primary-foreground/20"
                                  : "bg-primary/10",
                              )}
                            >
                              <Users
                                className={cn(
                                  "h-4 w-4",
                                  index === selectedMentionIndex
                                    ? "text-primary-foreground"
                                    : "text-primary",
                                )}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold">@all</p>
                              <p
                                className={cn(
                                  "text-xs truncate",
                                  index === selectedMentionIndex
                                    ? "text-primary-foreground/70"
                                    : "text-muted-foreground",
                                )}
                              >
                                {option.description}
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div
                              className={cn(
                                "flex h-9 w-9 items-center justify-center rounded-full shrink-0",
                                index === selectedMentionIndex
                                  ? "bg-primary-foreground/20"
                                  : "bg-secondary",
                              )}
                            >
                              <Bot
                                className={cn(
                                  "h-4 w-4",
                                  index === selectedMentionIndex
                                    ? "text-primary-foreground"
                                    : "text-secondary-foreground",
                                )}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold">
                                @{option.agent.slug}
                              </p>
                              <p
                                className={cn(
                                  "text-xs truncate",
                                  index === selectedMentionIndex
                                    ? "text-primary-foreground/70"
                                    : "text-muted-foreground",
                                )}
                              >
                                {option.agent.name} - {option.agent.role}
                              </p>
                            </div>
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-6 text-center">
                    <Bot className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No agents found
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Try a different search term
                    </p>
                  </div>
                )}

                <div className="px-3 py-2 border-t border-border bg-muted/30">
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 bg-background rounded border font-mono">
                        Tab
                      </kbd>
                      <span>select</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1 py-0.5 bg-background rounded border font-mono">
                        Esc
                      </kbd>
                      <span>close</span>
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Attached files preview */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {attachedFiles.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="relative group flex items-center gap-2 px-3 py-2 bg-muted/50 border border-border/50 rounded-lg"
                  >
                    {attachment.preview ? (
                      <div className="h-8 w-8 rounded overflow-hidden bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={attachment.preview}
                          alt={attachment.file.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium truncate max-w-[120px]">
                        {attachment.file.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {(attachment.file.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(attachment.id)}
                      className={cn(
                        "absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full",
                        "bg-destructive text-destructive-foreground",
                        "flex items-center justify-center",
                        "opacity-0 group-hover:opacity-100 transition-opacity",
                        "hover:bg-destructive/90",
                      )}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Main input container */}
            <div className="rounded-xl border border-border/50 bg-background overflow-hidden focus-within:ring-1 focus-within:ring-primary/30 focus-within:border-primary/50">
              {/* Textarea */}
              <Textarea
                ref={textareaRef}
                value={content}
                onChange={handleContentChange}
                onKeyDown={handleKeyDown}
                placeholder="Send a message..."
                rows={1}
                aria-label="Message input"
                aria-describedby="message-input-hints"
                aria-expanded={
                  (enableMentions && showMentionDropdown) ||
                  (enableSlashCommands && showSlashDropdown)
                }
                aria-haspopup="listbox"
                aria-autocomplete="list"
                className={cn(
                  "resize-none min-h-[56px] py-4 px-4 border-0 bg-transparent",
                  "focus-visible:ring-0 focus-visible:ring-offset-0",
                  "placeholder:text-muted-foreground/50 text-sm leading-relaxed",
                )}
              />

              {/* Bottom toolbar */}
              <div className="flex items-center justify-between px-3 py-2 border-t border-border/30 bg-muted/20">
                <div className="flex items-center gap-1">
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx,.txt,.csv,.json"
                  />

                  {/* Attachment button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Paperclip className="h-4 w-4" />
                        <span className="sr-only">Attach file</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>Attach files</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Model indicator - placeholder for future */}
                  {/* <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
                    <Sparkles className="h-3 w-3" />
                    <span>AI Agents</span>
                  </div> */}
                </div>

                {/* Send button */}
                <Button
                  type="submit"
                  disabled={!content.trim() || isSubmitting}
                  size="icon"
                  className={cn(
                    "h-8 w-8 rounded-full shrink-0 transition-all",
                    content.trim()
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span className="sr-only">Send message</span>
                </Button>
              </div>
            </div>

            {/* Keyboard hints */}
            <div
              id="message-input-hints"
              className="flex items-center gap-3 mt-2 px-1 opacity-60 hover:opacity-100 transition-opacity"
            >
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <kbd className="px-1 py-0.5 text-[9px] font-mono bg-muted/40 rounded border border-border/30">
                  Enter
                </kbd>
                send
              </span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <kbd className="px-1 py-0.5 text-[9px] font-mono bg-muted/40 rounded border border-border/30">
                  Shift+Enter
                </kbd>
                new line
              </span>
              {enableMentions ? (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <kbd className="px-1 py-0.5 text-[9px] font-mono bg-muted/40 rounded border border-border/30">
                    @
                  </kbd>
                  mention
                </span>
              ) : null}
              {enableSlashCommands ? (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <kbd className="px-1 py-0.5 text-[9px] font-mono bg-muted/40 rounded border border-border/30">
                    /
                  </kbd>
                  command
                </span>
              ) : null}
            </div>
          </div>
        </form>
      </div>
    </TooltipProvider>
  );
}
