'use client';

import React, { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { api } from '@packages/backend/convex/_generated/api';
import { useAccount } from '@/hooks/useAccount';

/**
 * CommandPaletteProvider: Wraps CommandPalette with Convex data fetching and navigation.
 * Mounts Cmd+K globally and provides quick access to tasks, docs, agents, and actions.
 */
export function CommandPaletteProvider() {
  const router = useRouter();
  const { accountId } = useAccount();

  // Fetch tasks for command palette - using Convex query
  const tasksData = useQuery(
    api.tasks.list,
    accountId ? { accountId, limit: 20 } : 'skip'
  );

  // Fetch documents for command palette
  const docsData = useQuery(
    api.documents.list,
    accountId ? { accountId, limit: 20 } : 'skip'
  );

  // Fetch agents for command palette (team members)
  const agentsData = useQuery(
    api.agents.list,
    accountId ? { accountId } : 'skip'
  );

  // Transform and normalize data for CommandPalette component
  const tasks = useMemo(
    () =>
      tasksData?.map((task) => ({
        id: task._id,
        title: task.title || 'Untitled Task',
      })) || [],
    [tasksData]
  );

  const docs = useMemo(
    () =>
      docsData?.map((doc) => ({
        id: doc._id,
        title: doc.title || 'Untitled Document',
      })) || [],
    [docsData]
  );

  const agents = useMemo(
    () =>
      agentsData?.map((agent) => ({
        id: agent._id,
        name: agent.name || 'Unknown Agent',
      })) || [],
    [agentsData]
  );

  // Fetch tasks for command palette
  const handleTaskCreate = useCallback(() => {
    // Navigate to task creation page
    router.push('/tasks/new');
  }, [router]);

  // Handle navigation actions
  const handleNavigate = useCallback(
    (path: string) => {
      router.push(path);
    },
    [router]
  );

  return (
    <CommandPalette
      onTaskCreate={handleTaskCreate}
      onNavigate={handleNavigate}
      tasks={tasks}
      docs={docs}
      agents={agents}
    />
  );
}

export default CommandPaletteProvider;
