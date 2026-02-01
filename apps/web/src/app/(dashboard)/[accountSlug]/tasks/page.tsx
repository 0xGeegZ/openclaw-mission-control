import { KanbanBoard } from "@/components/tasks/KanbanBoard";

interface TasksPageProps {
  params: Promise<{ accountSlug: string }>;
}

/**
 * Tasks page with Kanban board.
 */
export default async function TasksPage({ params }: TasksPageProps) {
  const { accountSlug } = await params;
  
  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-6 py-4 border-b">
        <h1 className="text-2xl font-bold">Tasks</h1>
      </header>
      
      <div className="flex-1 overflow-hidden py-4">
        <KanbanBoard accountSlug={accountSlug} />
      </div>
    </div>
  );
}
