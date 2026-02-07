export { cn } from "@packages/ui/lib/utils";

/**
 * Derives initials from a display name (e.g. "Jane Doe" → "JD").
 * Used for avatar fallbacks in members lists.
 */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Builds a tasks URL that opens the task detail sheet by default.
 */
export function getTaskDetailSheetHref(
  accountSlug: string,
  taskId: string,
): string {
  return `/${accountSlug}/tasks?taskId=${encodeURIComponent(taskId)}`;
}
