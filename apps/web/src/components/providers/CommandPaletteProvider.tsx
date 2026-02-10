'use client';

import React, { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useConvex } from 'convex/react';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { api } from '@packages/backend/convex/_generated/api';

/**
 * CommandPaletteProvider: Wraps CommandPalette with Convex data fetching and navigation.
 * Mounts Cmd+K globally and provides quick access to tasks, docs, agents, and actions.
 */
export function CommandPaletteProvider() {
  const router = useRouter();
  const convex = useConvex();

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

  // Fetch tasks, docs, and agents on mount
  // Note: In a real implementation, you'd use useQuery hooks from Convex
  // For now, we're passing empty arrays and the component handles them gracefully
  const tasks = [];
  const docs = [];
  const agents = [];

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
