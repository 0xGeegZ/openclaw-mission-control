"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { useAccount } from "@/lib/hooks/useAccount";

interface UseOrchestratorChatResult {
  taskId: Id<"tasks"> | null;
  isLoading: boolean;
  error: string | null;
  isOrchestratorConfigured: boolean;
  ensureChatTask: () => Promise<Id<"tasks"> | null>;
}

/**
 * Resolve or create the orchestrator chat task for the current account.
 */
export function useOrchestratorChat(): UseOrchestratorChatResult {
  const { account, accountId } = useAccount();
  const getOrCreateChat = useMutation(api.tasks.getOrCreateOrchestratorChat);
  const [createdTaskIds, setCreatedTaskIds] = useState<
    Record<string, Id<"tasks">>
  >({});
  const [loadingAccountId, setLoadingAccountId] = useState<string | null>(null);
  const [errorsByAccount, setErrorsByAccount] = useState<
    Record<string, string>
  >({});

  const isOrchestratorConfigured =
    account?.settings?.orchestratorAgentId != null;
  const existingTaskId =
    (account?.settings as { orchestratorChatTaskId?: Id<"tasks"> } | undefined)
      ?.orchestratorChatTaskId ?? null;
  const existingTask = useQuery(
    api.tasks.get,
    existingTaskId ? { taskId: existingTaskId } : "skip",
  );
  const isExistingTaskLoading =
    existingTaskId != null && existingTask === undefined;
  const resolvedExistingTaskId = existingTask?._id ?? null;

  const taskId = accountId
    ? (createdTaskIds[accountId] ?? resolvedExistingTaskId ?? null)
    : null;
  const isLoading =
    accountId != null &&
    (loadingAccountId === accountId || isExistingTaskLoading);
  const error = accountId != null ? (errorsByAccount[accountId] ?? null) : null;

  const ensureChatTask = useCallback(async () => {
    if (!accountId || !isOrchestratorConfigured) return null;
    if (isExistingTaskLoading) return null;
    if (taskId) return taskId;
    setLoadingAccountId(accountId);
    setErrorsByAccount((prev) => {
      const { [accountId]: _removed, ...rest } = prev;
      return rest;
    });
    try {
      const resolvedTaskId = await getOrCreateChat({ accountId });
      setCreatedTaskIds((prev) => ({
        ...prev,
        [accountId]: resolvedTaskId,
      }));
      return resolvedTaskId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorsByAccount((prev) => ({
        ...prev,
        [accountId]: message,
      }));
      return null;
    } finally {
      setLoadingAccountId(null);
    }
  }, [
    accountId,
    getOrCreateChat,
    isOrchestratorConfigured,
    isExistingTaskLoading,
    taskId,
  ]);

  return { taskId, isLoading, error, isOrchestratorConfigured, ensureChatTask };
}
