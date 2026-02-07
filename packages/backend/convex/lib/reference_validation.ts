/**
 * Phase 3: Reference Validation & Cascading Deletes
 *
 * This module provides:
 * 1. Reference validation - ensure foreign keys exist before mutations
 * 2. Cascading delete helpers - clean up child records when parent is deleted
 * 3. Data consistency checks - prevent orphaned records and integrity violations
 */

import type { DatabaseReader, DatabaseWriter } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Validate that an agent belongs to the given account.
 * Throws if agent doesn't exist or belongs to different account.
 */
export async function validateAgentBelongsToAccount(
  db: DatabaseReader,
  accountId: Id<"accounts">,
  agentId: Id<"agents">,
): Promise<void> {
  const agent = await db.get(agentId);
  if (!agent || agent.accountId !== accountId) {
    throw new Error(`Invalid agent: ${agentId} does not belong to account`);
  }
}

/**
 * Validate that a task belongs to the given account.
 * Throws if task doesn't exist or belongs to different account.
 */
export async function validateTaskBelongsToAccount(
  db: DatabaseReader,
  accountId: Id<"accounts">,
  taskId: Id<"tasks">,
): Promise<void> {
  const task = await db.get(taskId);
  if (!task || task.accountId !== accountId) {
    throw new Error(`Invalid task: ${taskId} does not belong to account`);
  }
}

/**
 * Validate that a document belongs to the given account.
 * Throws if document doesn't exist or belongs to different account.
 */
export async function validateDocumentBelongsToAccount(
  db: DatabaseReader,
  accountId: Id<"accounts">,
  documentId: Id<"documents">,
): Promise<void> {
  const doc = await db.get(documentId);
  if (!doc || doc.accountId !== accountId) {
    throw new Error(`Invalid document: ${documentId} does not belong to account`);
  }
}

/**
 * Validate that a document parent exists and belongs to the same account.
 * Throws if parent is invalid, doesn't exist, or belongs to different account.
 */
export async function validateDocumentParent(
  db: DatabaseReader,
  accountId: Id<"accounts">,
  parentId: Id<"documents">,
): Promise<void> {
  const parent = await db.get(parentId);
  if (!parent || parent.accountId !== accountId) {
    throw new Error(`Invalid document parent: does not belong to account`);
  }

  // Ensure it's a folder
  if (parent.kind && parent.kind !== "folder") {
    throw new Error(`Invalid document parent: must be a folder`);
  }
}

/**
 * Cascade delete all children of a document folder.
 * Recursively deletes all nested documents.
 */
export async function cascadeDeleteDocumentChildren(
  db: DatabaseReader,
  writer: DatabaseWriter,
  parentId: Id<"documents">,
): Promise<void> {
  const children = await db
    .query("documents")
    .withIndex("by_parent_name", (q) => q.eq("parentId", parentId))
    .collect();

  for (const child of children) {
    // Recursively delete nested folders
    if (child.kind === "folder") {
      await cascadeDeleteDocumentChildren(db, writer, child._id);
    }
    await writer.delete(child._id);
  }
}

/**
 * Cascade delete all messages in a task.
 */
export async function cascadeDeleteTaskMessages(
  db: DatabaseReader,
  writer: DatabaseWriter,
  taskId: Id<"tasks">,
): Promise<void> {
  const messages = await db
    .query("messages")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();

  for (const message of messages) {
    await writer.delete(message._id);
  }
}

/**
 * Cascade delete all subscriptions for a task.
 */
export async function cascadeDeleteTaskSubscriptions(
  db: DatabaseReader,
  writer: DatabaseWriter,
  taskId: Id<"tasks">,
): Promise<void> {
  const subscriptions = await db
    .query("subscriptions")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();

  for (const subscription of subscriptions) {
    await writer.delete(subscription._id);
  }
}

/**
 * Cascade delete all notifications for a task.
 */
export async function cascadeDeleteTaskNotifications(
  db: DatabaseReader,
  writer: DatabaseWriter,
  taskId: Id<"tasks">,
): Promise<void> {
  const notifications = await db
    .query("notifications")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();

  for (const notification of notifications) {
    await writer.delete(notification._id);
  }
}

/**
 * Comprehensive task deletion with full cascade.
 * Deletes task + all associated messages, subscriptions, notifications, and activities.
 */
export async function cascadeDeleteTask(
  db: DatabaseReader,
  writer: DatabaseWriter,
  taskId: Id<"tasks">,
): Promise<void> {
  // Delete messages (with any attached uploads)
  await cascadeDeleteTaskMessages(db, writer, taskId);

  // Delete subscriptions
  await cascadeDeleteTaskSubscriptions(db, writer, taskId);

  // Delete notifications
  await cascadeDeleteTaskNotifications(db, writer, taskId);

  // Delete associated activities (task-related events)
  const activities = await db
    .query("activities")
    .withIndex("by_target", (q) =>
      q.eq("targetType", "task").eq("targetId", taskId),
    )
    .collect();

  for (const activity of activities) {
    await writer.delete(activity._id);
  }

  // Delete task itself
  await writer.delete(taskId);
}

/**
 * Cascade delete all agents in an account.
 * Agents cannot be independently deleted; they're cleaned up when account is deleted.
 */
export async function cascadeDeleteAccountAgents(
  db: DatabaseReader,
  writer: DatabaseWriter,
  accountId: Id<"accounts">,
): Promise<void> {
  const agents = await db
    .query("agents")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();

  for (const agent of agents) {
    // Clean up agent-related activities
    const activities = await db
      .query("activities")
      .withIndex("by_actor", (q) =>
        q.eq("actorType", "agent").eq("actorId", agent._id),
      )
      .collect();

    for (const activity of activities) {
      await writer.delete(activity._id);
    }

    await writer.delete(agent._id);
  }
}

/**
 * Cascade delete all tasks in an account.
 */
export async function cascadeDeleteAccountTasks(
  db: DatabaseReader,
  writer: DatabaseWriter,
  accountId: Id<"accounts">,
): Promise<void> {
  const tasks = await db
    .query("tasks")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();

  for (const task of tasks) {
    await cascadeDeleteTask(db, writer, task._id);
  }
}

/**
 * Cascade delete all documents in an account.
 */
export async function cascadeDeleteAccountDocuments(
  db: DatabaseReader,
  writer: DatabaseWriter,
  accountId: Id<"accounts">,
): Promise<void> {
  // Delete all documents at root level (this will recursively delete nested docs)
  const rootDocs = await db
    .query("documents")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect()
    .then((docs) => docs.filter((d) => !d.parentId));

  for (const doc of rootDocs) {
    // Recursively delete nested folders
    if (doc.kind === "folder") {
      await cascadeDeleteDocumentChildren(db, writer, doc._id);
    }
    await writer.delete(doc._id);
  }
}

/**
 * Cascade delete all memberships, invitations, and skills in an account.
 */
export async function cascadeDeleteAccountMembershipsAndInvitations(
  db: DatabaseReader,
  writer: DatabaseWriter,
  accountId: Id<"accounts">,
): Promise<void> {
  // Delete memberships
  const memberships = await db
    .query("memberships")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();

  for (const membership of memberships) {
    await writer.delete(membership._id);
  }

  // Delete invitations
  const invitations = await db
    .query("invitations")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();

  for (const invitation of invitations) {
    await writer.delete(invitation._id);
  }
}

/**
 * Cascade delete all account-scoped data (subscriptions, notifications, activities, etc).
 */
export async function cascadeDeleteAccountMetadata(
  db: DatabaseReader,
  writer: DatabaseWriter,
  accountId: Id<"accounts">,
): Promise<void> {
  // Delete subscriptions
  const subscriptions = await db
    .query("subscriptions")
    .withIndex("by_account_created", (q) => q.eq("accountId", accountId))
    .collect();

  for (const sub of subscriptions) {
    await writer.delete(sub._id);
  }

  // Delete notifications
  const notifications = await db
    .query("notifications")
    .withIndex("by_account_created", (q) => q.eq("accountId", accountId))
    .collect();

  for (const notif of notifications) {
    await writer.delete(notif._id);
  }

  // Delete activities
  const activities = await db
    .query("activities")
    .withIndex("by_account_created", (q) => q.eq("accountId", accountId))
    .collect();

  for (const activity of activities) {
    await writer.delete(activity._id);
  }

  // Delete skills
  const skills = await db
    .query("skills")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();

  for (const skill of skills) {
    await writer.delete(skill._id);
  }

  // Delete uploads
  const uploads = await db
    .query("messageUploads")
    .withIndex("by_account_created", (q) => q.eq("accountId", accountId))
    .collect();

  for (const upload of uploads) {
    await writer.delete(upload._id);
  }

  // Delete standup summaries
  const summaries = await db
    .query("standupSummaries")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();

  for (const summary of summaries) {
    await writer.delete(summary._id);
  }

  // Delete runtimes
  const runtimes = await db
    .query("runtimes")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();

  for (const runtime of runtimes) {
    await writer.delete(runtime._id);
  }
}

/**
 * Comprehensive account deletion with full cascade.
 * Deletes all account data in the correct order to respect foreign keys.
 *
 * Order of deletion:
 * 1. Tasks (which deletes messages, subscriptions, notifications, activities)
 * 2. Agents
 * 3. Documents (recursive)
 * 4. Memberships and invitations
 * 5. Metadata (subscriptions, notifications, activities, skills, uploads, etc)
 * 6. Account itself
 */
export async function cascadeDeleteAccount(
  db: DatabaseReader,
  writer: DatabaseWriter,
  accountId: Id<"accounts">,
): Promise<void> {
  // Delete tasks first (which cascades to messages, subscriptions, notifications)
  await cascadeDeleteAccountTasks(db, writer, accountId);

  // Delete agents
  await cascadeDeleteAccountAgents(db, writer, accountId);

  // Delete documents (recursive)
  await cascadeDeleteAccountDocuments(db, writer, accountId);

  // Delete memberships and invitations
  await cascadeDeleteAccountMembershipsAndInvitations(db, writer, accountId);

  // Delete remaining metadata
  await cascadeDeleteAccountMetadata(db, writer, accountId);

  // Finally delete the account itself
  await writer.delete(accountId);
}

/**
 * Check for orphaned references in a task.
 * Returns list of issues found.
 */
export async function validateTaskReferences(
  db: DatabaseReader,
  task: Record<string, any>,
): Promise<string[]> {
  const issues: string[] = [];

  const taskAccountId = task.accountId as Id<"accounts"> | undefined;
  if (!taskAccountId) return issues;

  // Validate assigned agents exist and belong to account
  for (const agentId of task.assignedAgentIds || []) {
    const agent = await db.get(agentId as Id<"agents">);
    if (!agent || (agent as { accountId?: Id<"accounts"> }).accountId !== taskAccountId) {
      issues.push(`Agent ${agentId} not found or belongs to different account`);
    }
  }

  // Validate current task assignment (if any)
  if (task.currentTaskId) {
    const currentTask = await db.get(task.currentTaskId as Id<"tasks">);
    if (
      !currentTask ||
      (currentTask as { accountId?: Id<"accounts"> }).accountId !== taskAccountId
    ) {
      issues.push(`Current task ${task.currentTaskId} is invalid`);
    }
  }

  return issues;
}

/**
 * Check for orphaned references in a document.
 * Returns list of issues found.
 */
export async function validateDocumentReferences(
  db: DatabaseReader,
  doc: Record<string, any>,
): Promise<string[]> {
  const issues: string[] = [];

  const docAccountId = doc.accountId as Id<"accounts"> | undefined;
  if (!docAccountId) return issues;

  // Validate parent exists and belongs to account
  if (doc.parentId) {
    const parent = await db.get(doc.parentId as Id<"documents">);
    if (
      !parent ||
      (parent as { accountId?: Id<"accounts"> }).accountId !== docAccountId
    ) {
      issues.push(`Document parent ${doc.parentId} is invalid`);
    }
  }

  // Validate associated task exists
  if (doc.taskId) {
    const task = await db.get(doc.taskId as Id<"tasks">);
    if (
      !task ||
      (task as { accountId?: Id<"accounts"> }).accountId !== docAccountId
    ) {
      issues.push(`Document task reference ${doc.taskId} is invalid`);
    }
  }

  return issues;
}
