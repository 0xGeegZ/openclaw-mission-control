"use client";

import { Streamdown } from "streamdown";
import { cn } from "@packages/ui/lib/utils";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** Smaller text size for compact display */
  compact?: boolean;
}

/**
 * Renders markdown content with proper typography styling.
 * Uses Streamdown for parsing and Tailwind Typography for styling.
 */
export function MarkdownRenderer({ content, className, compact = false }: MarkdownRendererProps) {
  return (
    <div 
      className={cn(
        "prose dark:prose-invert max-w-none",
        "prose-p:leading-relaxed",
        "prose-pre:bg-muted prose-pre:border prose-pre:border-border",
        "prose-code:text-primary prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none",
        "prose-headings:text-foreground prose-headings:font-semibold",
        "prose-h1:text-xl prose-h1:mb-4 prose-h1:mt-6 first:prose-h1:mt-0",
        "prose-h2:text-lg prose-h2:mb-3 prose-h2:mt-5",
        "prose-h3:text-base prose-h3:mb-2 prose-h3:mt-4",
        "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
        "prose-ul:my-2 prose-ol:my-2",
        "prose-li:my-0.5",
        "prose-blockquote:border-l-primary prose-blockquote:bg-muted/50 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:not-italic",
        "prose-strong:text-foreground prose-strong:font-semibold",
        "prose-img:rounded-lg prose-img:border prose-img:border-border",
        "prose-table:text-sm",
        "prose-th:bg-muted prose-th:px-3 prose-th:py-2",
        "prose-td:px-3 prose-td:py-2 prose-td:border-b prose-td:border-border",
        compact ? "prose-sm text-foreground/90" : "text-foreground",
        className
      )}
    >
      <Streamdown>{content}</Streamdown>
    </div>
  );
}
