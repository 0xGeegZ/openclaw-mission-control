import { KanbanBoard } from "@/components/tasks/KanbanBoard";
import { TasksPageHeader } from "@/components/tasks/TasksPageHeader";

interface TasksPageProps {
  params: Promise<{ accountSlug: string }>;
}

/**
 * Tasks page with Kanban board, header stats, and live clock.
 */
export default async function TasksPage({ params }: TasksPageProps) {
  const { accountSlug } = await params;

  return (
    <div className="flex flex-col h-full">
      <TasksPageHeader accountSlug={accountSlug} />
      <div className="flex-1 overflow-hidden py-4">
        <KanbanBoard accountSlug={accountSlug} />
      </div>
    </div>
  );
}
