"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Id } from "@packages/backend/convex/_generated/dataModel";

/** URL search param key for the selected task (task detail sheet and sidebar typing context). */
export const TASK_ID_SEARCH_PARAM = "taskId";

/**
 * Returns the task ID from the current URL search params, or null if missing.
 * Used by tasks page and Kanban board to sync sidebar typing and task detail sheet with the URL.
 */
export function useTaskIdFromSearchParams(): Id<"tasks"> | null {
  const searchParams = useSearchParams();
  return useMemo(() => {
    const taskId = searchParams.get(TASK_ID_SEARCH_PARAM);
    return taskId ? (taskId as Id<"tasks">) : null;
  }, [searchParams]);
}
