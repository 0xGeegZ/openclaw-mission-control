"use client";

import React, { useMemo } from "react";
import { Streamdown } from "streamdown";

export interface Mention {
  name: string;
  id?: string;
}

/**
 * Renders a mention badge inline.
 */
const MentionBadge = ({ name }: { name: string }) => (
  <span
    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded-md bg-primary/10 text-primary font-medium text-sm hover:bg-primary/15 transition-colors cursor-default"
    title={`Mentioned: ${name}`}
  >
    @{name}
  </span>
);

/**
 * Process text content to replace @mentions with styled badges.
 * Supports both @word and @"name with spaces" patterns.
 * Returns an array of strings and React nodes.
 */
function processTextWithMentions(
  text: string,
  mentionMap: Map<string, Mention>
): (string | React.ReactNode)[] {
  if (!text || mentionMap.size === 0) {
    return [text];
  }

  // Match both @word and @"quoted name" patterns
  const mentionRegex = /@(?:"([^"]+)"|(\w+))/g;
  const parts: (string | React.ReactNode)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Get the mention name (either from quoted group or word group)
    const mentionName = match[1] || match[2];
    const mention = mentionMap.get(mentionName.toLowerCase());

    if (mention) {
      parts.push(
        <MentionBadge key={`mention-${match.index}`} name={mention.name} />
      );
    } else {
      // Not a valid mention, keep original text
      parts.push(match[0]);
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.filter((part) => part !== "");
}

/**
 * Creates Streamdown custom components that process mentions inline.
 * Overrides p, span, li, etc. to inject mention badges while keeping content inline.
 */
function createMentionComponents(mentionMap: Map<string, Mention>) {
  const processChildren = (children: React.ReactNode): React.ReactNode => {
    if (typeof children === "string") {
      const processed = processTextWithMentions(children, mentionMap);
      return processed.length === 1 && typeof processed[0] === "string"
        ? processed[0]
        : <>{processed}</>;
    }
    if (Array.isArray(children)) {
      return children.map((child, index) => {
        if (typeof child === "string") {
          const processed = processTextWithMentions(child, mentionMap);
          return processed.length === 1 && typeof processed[0] === "string"
            ? processed[0]
            : <React.Fragment key={index}>{processed}</React.Fragment>;
        }
        return child;
      });
    }
    return children;
  };

  return {
    p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
      <p {...props}>{processChildren(children)}</p>
    ),
    span: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
      <span {...props}>{processChildren(children)}</span>
    ),
    li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
      <li {...props}>{processChildren(children)}</li>
    ),
    td: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLTableCellElement>) => (
      <td {...props}>{processChildren(children)}</td>
    ),
    th: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLTableCellElement>) => (
      <th {...props}>{processChildren(children)}</th>
    ),
  };
}

export interface MessageContentProps {
  content: string;
  mentions?: Mention[];
}

/**
 * Component that renders message content with inline styled @mentions using Streamdown.
 * Uses custom components to process mentions in all text-containing elements.
 *
 * Supports:
 * - Simple mentions: @name
 * - Quoted mentions: @"name with spaces"
 * - Full markdown rendering via Streamdown
 */
export function MessageContent({ content, mentions }: MessageContentProps) {
  const components = useMemo(() => {
    if (!mentions || mentions.length === 0) {
      return undefined;
    }
    const mentionMap = new Map(
      mentions.map((m) => [m.name.toLowerCase(), m])
    );
    return createMentionComponents(mentionMap);
  }, [mentions]);

  return <Streamdown components={components}>{content}</Streamdown>;
}
