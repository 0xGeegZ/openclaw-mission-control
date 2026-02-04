"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id, Doc } from "@packages/backend/convex/_generated/dataModel";
import { Textarea } from "@packages/ui/components/textarea";
import { Button } from "@packages/ui/components/button";
import { Send, Loader2, Bot, Users, Sparkles, Paperclip, X, FileText, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@packages/ui/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@packages/ui/components/tooltip";
import { useAccount } from "@/lib/hooks/useAccount";

interface AttachedFile {
  id: string;
  file: File;
  preview?: string;
}

interface MessageInputProps {
  taskId: Id<"tasks">;
  showSuggestions?: boolean;
  onSuggestionClick?: (suggestion: string) => void;
}

type MentionOption = 
  | { type: "all"; label: string; description: string }
  | { type: "agent"; agent: Doc<"agents"> };

/**
 * Message input with send button and @ mention autocomplete.
 */
export function MessageInput({ taskId, showSuggestions = false, onSuggestionClick }: MessageInputProps) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { accountId } = useAccount();
  const agents = useQuery(
    api.agents.list,
    accountId ? { accountId } : "skip"
  );
  
  const createMessage = useMutation(api.messages.create);
  
  // Loading state for agents
  const isLoadingAgents = agents === undefined;
  
  // Filter agents based on mention query
  const filteredAgents = useMemo((): MentionOption[] => {
    const query = mentionQuery.toLowerCase();
    
    // Add "all" option at the top
    const allOption: MentionOption = {
      type: "all",
      label: "all",
      description: "Mention all agents"
    };
    
    // If still loading, return just the "all" option if it matches
    if (!agents) {
      if ("all".includes(query)) {
        return [allOption];
      }
      return [];
    }
    
    const agentOptions: MentionOption[] = agents
      .filter(agent => 
        agent.name.toLowerCase().includes(query) ||
        agent.slug.toLowerCase().includes(query) ||
        agent.role.toLowerCase().includes(query)
      )
      .map(agent => ({ type: "agent" as const, agent }));
    
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
  
  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setContent(value);
    
    // Check for @ mention trigger
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    
    if (atMatch) {
      setShowMentionDropdown(true);
      setMentionQuery(atMatch[1]);
      setMentionStartIndex(cursorPos - atMatch[0].length);
    } else {
      setShowMentionDropdown(false);
      setMentionQuery("");
      setMentionStartIndex(null);
    }
  }, []);
  
  const insertMention = useCallback((mentionText: string) => {
    if (mentionStartIndex === null) return;
    
    const beforeMention = content.slice(0, mentionStartIndex);
    const afterCursor = content.slice(
      mentionStartIndex + mentionQuery.length + 1 // +1 for the @
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
  }, [content, mentionStartIndex, mentionQuery.length]);
  
  const handleMentionSelect = useCallback((option: MentionOption) => {
    if (option.type === "all") {
      insertMention("all");
    } else {
      insertMention(option.agent.slug);
    }
  }, [insertMention]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      await createMessage({
        taskId,
        content: content.trim(),
      });
      
      setContent("");
      setShowMentionDropdown(false);
      textareaRef.current?.focus();
    } catch (error) {
      toast.error("Failed to send message", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle mention dropdown navigation
    if (showMentionDropdown && filteredAgents.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedMentionIndex(prev => 
          prev < filteredAgents.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedMentionIndex(prev => 
          prev > 0 ? prev - 1 : filteredAgents.length - 1
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleMentionSelect(filteredAgents[selectedMentionIndex]);
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
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current && 
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowMentionDropdown(false);
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  // File attachment handlers
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newAttachments: AttachedFile[] = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));
    setAttachedFiles(prev => [...prev, ...newAttachments]);
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);
  
  const removeAttachment = useCallback((id: string) => {
    setAttachedFiles(prev => {
      const removed = prev.find(f => f.id === id);
      if (removed?.preview) {
        URL.revokeObjectURL(removed.preview);
      }
      return prev.filter(f => f.id !== id);
    });
  }, []);
  
  // Cleanup previews on unmount
  useEffect(() => {
    return () => {
      attachedFiles.forEach(f => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const handleSuggestionSelect = useCallback((suggestion: string) => {
    setContent(suggestion);
    onSuggestionClick?.(suggestion);
    textareaRef.current?.focus();
  }, [onSuggestionClick]);
  
  // Suggested prompts
  const suggestions = [
    "What are the next steps for this task?",
    "Summarize the current status",
    "Help me draft a response",
    "List all action items",
  ];

  // Scroll selected item into view
  useEffect(() => {
    if (showMentionDropdown && dropdownRef.current) {
      const selectedElement = dropdownRef.current.querySelector(`[data-index="${selectedMentionIndex}"]`);
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedMentionIndex, showMentionDropdown]);
  
  return (
    <TooltipProvider>
      <div ref={containerRef} className="border-t bg-card/80 backdrop-blur-sm">
        {/* Suggestion chips - shown when thread is empty */}
        {showSuggestions && !content && (
          <div className="px-4 pt-4 pb-2">
            <div className="grid grid-cols-2 gap-2">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleSuggestionSelect(suggestion)}
                  className={cn(
                    "px-4 py-3 text-left text-sm rounded-xl transition-all",
                    "border border-primary/20 hover:border-primary/40",
                    "bg-background hover:bg-accent/50",
                    "text-foreground/80 hover:text-foreground"
                  )}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="p-4">
          <div className="relative">
            {/* Mention Autocomplete Dropdown - positioned above input */}
            {showMentionDropdown && (
              <div 
                ref={dropdownRef}
                className="absolute bottom-full left-0 right-0 mb-2 bg-popover border border-border rounded-xl shadow-xl overflow-hidden z-50 max-w-sm"
              >
                <div className="px-3 py-2.5 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <p className="text-xs font-medium text-foreground">Mention an agent</p>
                  </div>
                </div>
                
                {isLoadingAgents ? (
                  <div className="px-3 py-6 flex flex-col items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Loading agents...</p>
                  </div>
                ) : filteredAgents.length > 0 ? (
                  <div className="max-h-64 overflow-y-auto p-1">
                    {filteredAgents.map((option, index) => (
                      <button
                        key={option.type === "all" ? "all" : option.agent._id}
                        type="button"
                        data-index={index}
                        onClick={() => handleMentionSelect(option)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all rounded-lg",
                          index === selectedMentionIndex 
                            ? "bg-primary text-primary-foreground" 
                            : "hover:bg-accent"
                        )}
                      >
                        {option.type === "all" ? (
                          <>
                            <div className={cn(
                              "flex h-9 w-9 items-center justify-center rounded-full shrink-0",
                              index === selectedMentionIndex 
                                ? "bg-primary-foreground/20" 
                                : "bg-primary/10"
                            )}>
                              <Users className={cn(
                                "h-4 w-4",
                                index === selectedMentionIndex ? "text-primary-foreground" : "text-primary"
                              )} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold">@all</p>
                              <p className={cn(
                                "text-xs truncate",
                                index === selectedMentionIndex 
                                  ? "text-primary-foreground/70" 
                                  : "text-muted-foreground"
                              )}>
                                {option.description}
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className={cn(
                              "flex h-9 w-9 items-center justify-center rounded-full shrink-0",
                              index === selectedMentionIndex 
                                ? "bg-primary-foreground/20" 
                                : "bg-secondary"
                            )}>
                              <Bot className={cn(
                                "h-4 w-4",
                                index === selectedMentionIndex 
                                  ? "text-primary-foreground" 
                                  : "text-secondary-foreground"
                              )} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold">@{option.agent.slug}</p>
                              <p className={cn(
                                "text-xs truncate",
                                index === selectedMentionIndex 
                                  ? "text-primary-foreground/70" 
                                  : "text-muted-foreground"
                              )}>
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
                    <p className="text-sm text-muted-foreground">No agents found</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Try a different search term</p>
                  </div>
                )}
                
                <div className="px-3 py-2 border-t border-border bg-muted/30">
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 bg-background rounded border font-mono">Tab</kbd>
                      <span>select</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1 py-0.5 bg-background rounded border font-mono">Esc</kbd>
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
                        "hover:bg-destructive/90"
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
                className={cn(
                  "resize-none min-h-[56px] py-4 px-4 border-0 bg-transparent",
                  "focus-visible:ring-0 focus-visible:ring-offset-0",
                  "placeholder:text-muted-foreground/50 text-sm leading-relaxed"
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
                  <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
                    <Sparkles className="h-3 w-3" />
                    <span>AI Agents</span>
                  </div>
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
                      : "bg-muted text-muted-foreground"
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
            <div className="flex items-center gap-4 mt-2 px-1">
              <p className="text-[11px] text-muted-foreground/70">
                <kbd className="px-1.5 py-0.5 text-[10px] font-medium bg-muted/50 rounded border border-border/50 mr-1">Enter</kbd>
                send
              </p>
              <p className="text-[11px] text-muted-foreground/70">
                <kbd className="px-1.5 py-0.5 text-[10px] font-medium bg-muted/50 rounded border border-border/50 mr-1">Shift+Enter</kbd>
                new line
              </p>
              <p className="text-[11px] text-muted-foreground/70">
                <kbd className="px-1.5 py-0.5 text-[10px] font-medium bg-muted/50 rounded border border-border/50 mr-1">@</kbd>
                mention agent
              </p>
            </div>
          </div>
        </form>
      </div>
    </TooltipProvider>
  );
}
