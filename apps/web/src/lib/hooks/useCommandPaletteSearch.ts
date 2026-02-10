"use client";

import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
import type { Id } from "@packages/backend/convex/_generated/dataModel";

export interface CommandPaletteSearchResult {
  tasks: Array<{ id: Id<"tasks">; title: string; status: string }>;
  documents: Array<{ id: Id<"documents">; title: string }>;
  agents: Array<{ id: Id<"agents">; title: string; role?: string }>;
  isLoading: boolean;
}

/**
 * Hook to search tasks, documents, and agents via CommandPalette search query.
 * Automatically uses the current account context.
 */
export function useCommandPaletteSearch(
  searchQuery: string
): CommandPaletteSearchResult {
  const { accountId } = useAccount();

  const results = useQuery(
    api.search.globalSearch,
    accountId && searchQuery.length > 0
      ? { accountId, searchQuery }
      : "skip"
  );

  if (results === undefined) {
    return {
      tasks: [],
      documents: [],
      agents: [],
      isLoading: !!accountId && searchQuery.length > 0,
    };
  }

  return {
    tasks: results.tasks || [],
    documents: results.documents || [],
    agents: results.agents || [],
    isLoading: false,
  };
}
