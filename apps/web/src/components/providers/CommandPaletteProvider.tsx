'use client';

import React, { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CommandPalette } from '@/components/ui/CommandPalette';

/**
 * CommandPaletteProvider: Wraps CommandPalette with navigation callbacks.
 * CommandPalette now fetches data dynamically via useCommandPaletteSearch hook.
 * Mounts Cmd+K globally and provides quick access to tasks, docs, agents, and actions.
 */
export function CommandPaletteProvider() {
  const router = useRouter();

  // Handle task creation
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
    />
  );
}

export default CommandPaletteProvider;
