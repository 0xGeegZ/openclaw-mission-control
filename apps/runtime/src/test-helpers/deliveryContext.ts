/**
 * Shared test helpers for building DeliveryContext and id casts.
 * Used by delivery-loop.test.ts and delivery.test.ts to avoid duplication.
 */
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import type { DeliveryContext } from "../delivery/types";

export const aid = (s: string): Id<"agents"> => s as Id<"agents">;
export const tid = (s: string): Id<"tasks"> => s as Id<"tasks">;
export const nid = (s: string): Id<"notifications"> => s as Id<"notifications">;
export const accId = (s: string): Id<"accounts"> => s as Id<"accounts">;
export const mid = (s: string): Id<"messages"> => s as Id<"messages">;

/** Build a minimal DeliveryContext for tests. */
export function buildContext(
  overrides: Partial<DeliveryContext> = {},
): DeliveryContext {
  const base: DeliveryContext = {
    notification: {
      _id: nid("n1"),
      type: "thread_update",
      title: "Update",
      body: "Body",
      recipientId: "agent-a",
      accountId: accId("acc1"),
    },
    agent: { _id: aid("agent-a"), role: "Developer", name: "Engineer" },
    task: {
      _id: tid("task1"),
      status: "in_progress",
      title: "Task",
      assignedAgentIds: [aid("agent-a")],
    },
    message: {
      _id: mid("m1"),
      authorType: "agent",
      authorId: "agent-b",
      content: "Done",
    },
    thread: [],
    sourceNotificationType: null,
    orchestratorAgentId: null,
    primaryUserMention: null,
    mentionableAgents: [],
    assignedAgents: [],
    effectiveBehaviorFlags: {},
    deliverySessionKey: "system:agent:engineer:acc1:v1",
    repositoryDoc: null,
    globalBriefingDoc: null,
    taskOverview: null,
  };
  return { ...base, ...overrides } as DeliveryContext;
}
