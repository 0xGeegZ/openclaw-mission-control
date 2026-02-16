"use client";

import React, { useMemo } from "react";
import { Streamdown } from "streamdown";
import type { RecipientType } from "@packages/shared";
import { MENTION_TOKEN_REGEX, findLongestMentionKey } from "@packages/shared";

/**
 * Display shape for a mention. Matches Convex messages.mentions stored shape
 * (type, id, name, optional slug); id and type are optional for display-only use.
 */
export interface Mention {
  name: string;
  id?: string;
  type?: RecipientType;
  /** Agent slug so @slug in content matches (e.g. @squad-lead). */
  slug?: string;
}

/**
 * Renders a single @mention as an inline badge.
 */
function MentionBadge({ name }: { name: string }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded-md bg-primary/10 text-primary font-medium text-sm hover:bg-primary/15 transition-colors cursor-default"
      title={`Mentioned: ${name}`}
    >
      @{name}
    </span>
  );
}

/** Matches @all so we can render it as a badge even though backend stores expanded list. */
const HAS_ALL_MENTION = /@all\b/i;

/**
 * Splits text by @mentions and returns an array of string segments and
 * MentionBadge nodes. Only resolved mentions (or @all) render as badges;
 * unresolved @-tokens are left as plain text.
 *
 * @param text - Raw message segment
 * @param mentionMap - Map of normalized name (lowercase) -> Mention
 * @returns Array of strings and React nodes for rendering
 */
function processTextWithMentions(
  text: string,
  mentionMap: Map<string, Mention>,
  sortedMentionKeys: string[],
): (string | React.ReactNode)[] {
  if (!text) {
    return [text];
  }

  const parts: (string | React.ReactNode)[] = [];
  let lastIndex = 0;
  let keyIndex = 0;
  const re = new RegExp(MENTION_TOKEN_REGEX.source, MENTION_TOKEN_REGEX.flags);
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const quoted = match[1];
    const unquoted = match[2] ?? "";
    const mentionName = quoted ?? unquoted;
    const normalized = mentionName.trim().toLowerCase();
    let mention = mentionMap.get(normalized);
    let consumedLength = match[0].length;

    if (!mention && unquoted) {
      const key = findLongestMentionKey(unquoted, sortedMentionKeys);
      if (key) {
        mention = mentionMap.get(key);
        consumedLength = 1 + key.length;
      }
    }

    if (!mention) {
      parts.push(match[0]);
      lastIndex = match.index + match[0].length;
      continue;
    }

    parts.push(
      <MentionBadge key={`mention-${keyIndex++}`} name={mention.name} />,
    );
    if (consumedLength < match[0].length) {
      parts.push(match[0].slice(consumedLength));
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.filter((part) => part !== "");
}

/**
 * Builds Streamdown custom component overrides (p, span, li, td, th) that
 * run processTextWithMentions on string children so mention badges render inline.
 */
function createMentionComponents(
  mentionMap: Map<string, Mention>,
  sortedMentionKeys: string[],
) {
  const processChildren = (children: React.ReactNode): React.ReactNode => {
    if (typeof children === "string") {
      const processed = processTextWithMentions(
        children,
        mentionMap,
        sortedMentionKeys,
      );
      return processed.length === 1 && typeof processed[0] === "string" ? (
        processed[0]
      ) : (
        <>{processed}</>
      );
    }
    if (Array.isArray(children)) {
      return children.map((child, index) => {
        if (typeof child === "string") {
          const processed = processTextWithMentions(
            child,
            mentionMap,
            sortedMentionKeys,
          );
          return processed.length === 1 && typeof processed[0] === "string" ? (
            processed[0]
          ) : (
            <React.Fragment key={index}>{processed}</React.Fragment>
          );
        }
        if (React.isValidElement<{ children?: React.ReactNode }>(child)) {
          const nestedChildren = processChildren(child.props.children);
          return React.cloneElement(child, undefined, nestedChildren);
        }
        return child;
      });
    }
    // Single element (e.g. <strong> from **bold** markdown): recurse so @mentions inside are processed
    if (React.isValidElement<{ children?: React.ReactNode }>(children)) {
      const element = children;
      const nestedChildren = processChildren(element.props.children);
      return React.cloneElement(element, undefined, nestedChildren);
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
  /** Markdown message body (supports Streamdown). */
  content: string;
  /** Resolved mentions from Convex message; used to render @mentions as badges. */
  mentions?: Mention[];
}

/**
 * Renders message body as markdown (Streamdown) with inline @mention badges.
 * Mention patterns: @name, @hyphenated-name, @"name with spaces".
 * Only resolved mentions (or @all) render as badges.
 */
export function MessageContent({ content, mentions }: MessageContentProps) {
  const components = useMemo(() => {
    const mentionMap = new Map<string, Mention>();

    if (mentions?.length) {
      for (const m of mentions) {
        mentionMap.set(m.name.toLowerCase(), m);
        if (m.slug) {
          mentionMap.set(m.slug.toLowerCase(), m);
        }
      }
    }

    // Backend expands @all into the full user/agent list; add synthetic "all" so it renders as a badge.
    if (content && HAS_ALL_MENTION.test(content)) {
      mentionMap.set("all", { name: "all" });
    }

    const sortedMentionKeys = Array.from(mentionMap.keys()).sort(
      (a, b) => b.length - a.length,
    );
    // Always use mention components so resolved @-tokens render as badges inline.
    return createMentionComponents(mentionMap, sortedMentionKeys);
  }, [content, mentions]);

  return <Streamdown components={components}>{content}</Streamdown>;
}
