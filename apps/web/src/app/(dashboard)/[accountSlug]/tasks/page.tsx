import { TasksPageContent } from "@/components/tasks/TasksPageContent";

interface TasksPageProps {
  params: Promise<{ accountSlug: string }>;
}

/**
 * Tasks page with Kanban board, agents sidebar, and task detail sheet.
 */
export default async function TasksPage({ params }: TasksPageProps) {
  const { accountSlug } = await params;

  return <TasksPageContent accountSlug={accountSlug} />;
}
