/**
 * Shared test helpers for building DeliveryContext and id casts.
 * Used by delivery-loop.test.ts and delivery.test.ts to avoid duplication.
 */
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import type { DeliveryContext } from "@packages/backend/convex/service/notifications";

export const aid = (s: string): Id<"agents"> => s as Id<"agents">;
export const tid = (s: string): Id<"tasks"> => s as Id<"tasks">;
export const nid = (s: string): Id<"notifications"> => s as Id<"notifications">;
export const accId = (s: string): Id<"accounts"> => s as Id<"accounts">;
export const mid = (s: string): Id<"messages"> => s as Id<"messages">;

/**
 * Overrides for buildContext: keys match DeliveryContext but values may be minimal (partial) objects.
 * Allows test code to pass only the fields under test without satisfying full Doc<> shapes.
 */
export type DeliveryContextOverrides = {
  [K in keyof DeliveryContext]?: unknown;
};

/**
 * Build a minimal DeliveryContext for tests.
 * Base fixture must include every field read by policy, prompt, and delivery code.
 * Cast is intentional so we can use a minimal shape instead of full Doc<>.
 */
export function buildContext(
  overrides: DeliveryContextOverrides = {},
): DeliveryContext {
  const base = {
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
