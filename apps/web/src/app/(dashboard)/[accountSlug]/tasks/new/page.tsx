"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { CreateTaskDialog } from "@/components/tasks/CreateTaskDialog";

interface TasksNewPageProps {
  params: Promise<{ accountSlug: string }>;
}

/**
 * Task creation page. Displays a task creation dialog for quick task creation.
 * Used by the Command Palette (Cmd+K) to initiate task creation.
 * Redirects back to tasks list after successful creation.
 */
export default function TasksNewPage({ params }: TasksNewPageProps) {
  const router = useRouter();
  const routerParams = useParams();
  const [isOpen, setIsOpen] = useState(true);
  const [accountSlug, setAccountSlug] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ accountSlug }) => {
      setAccountSlug(accountSlug);
    });
  }, [params]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      // If dialog closes, redirect back to tasks page
      if (!open && accountSlug) {
        router.push(`/${accountSlug}/tasks`);
      }
    },
    [accountSlug, router]
  );

  return (
    <CreateTaskDialog
      open={isOpen}
      onOpenChange={handleOpenChange}
    />
  );
}
