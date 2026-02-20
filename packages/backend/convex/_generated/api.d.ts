/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as activities from "../activities.js";
import type * as agents from "../agents.js";
import type * as analytics from "../analytics.js";
import type * as billing from "../billing.js";
import type * as documents from "../documents.js";
import type * as fleet from "../fleet.js";
import type * as invitations from "../invitations.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_agent_soul from "../lib/agent_soul.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_behavior_flags from "../lib/behavior_flags.js";
import type * as lib_billing_enforcement from "../lib/billing_enforcement.js";
import type * as lib_mentions from "../lib/mentions.js";
import type * as lib_notifications from "../lib/notifications.js";
import type * as lib_seed_skills_build from "../lib/seed_skills_build.js";
import type * as lib_service_auth from "../lib/service_auth.js";
import type * as lib_skills_validation from "../lib/skills_validation.js";
import type * as lib_task_workflow from "../lib/task_workflow.js";
import type * as lib_user_identity_fallback from "../lib/user_identity_fallback.js";
import type * as lib_validators from "../lib/validators.js";
import type * as memberships from "../memberships.js";
import type * as messages from "../messages.js";
import type * as notifications from "../notifications.js";
import type * as runtimes from "../runtimes.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as service_actions from "../service/actions.js";
import type * as service_agentRuntimeSessions from "../service/agentRuntimeSessions.js";
import type * as service_agents from "../service/agents.js";
import type * as service_documents from "../service/documents.js";
import type * as service_messages from "../service/messages.js";
import type * as service_notifications from "../service/notifications.js";
import type * as service_tasks from "../service/tasks.js";
import type * as skills from "../skills.js";
import type * as standup from "../standup.js";
import type * as subscriptions from "../subscriptions.js";
import type * as tasks from "../tasks.js";
import type * as utils from "../utils.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  activities: typeof activities;
  agents: typeof agents;
  analytics: typeof analytics;
  billing: typeof billing;
  documents: typeof documents;
  fleet: typeof fleet;
  invitations: typeof invitations;
  "lib/activity": typeof lib_activity;
  "lib/agent_soul": typeof lib_agent_soul;
  "lib/auth": typeof lib_auth;
  "lib/behavior_flags": typeof lib_behavior_flags;
  "lib/billing_enforcement": typeof lib_billing_enforcement;
  "lib/mentions": typeof lib_mentions;
  "lib/notifications": typeof lib_notifications;
  "lib/seed_skills_build": typeof lib_seed_skills_build;
  "lib/service_auth": typeof lib_service_auth;
  "lib/skills_validation": typeof lib_skills_validation;
  "lib/task_workflow": typeof lib_task_workflow;
  "lib/user_identity_fallback": typeof lib_user_identity_fallback;
  "lib/validators": typeof lib_validators;
  memberships: typeof memberships;
  messages: typeof messages;
  notifications: typeof notifications;
  runtimes: typeof runtimes;
  search: typeof search;
  seed: typeof seed;
  "service/actions": typeof service_actions;
  "service/agentRuntimeSessions": typeof service_agentRuntimeSessions;
  "service/agents": typeof service_agents;
  "service/documents": typeof service_documents;
  "service/messages": typeof service_messages;
  "service/notifications": typeof service_notifications;
  "service/tasks": typeof service_tasks;
  skills: typeof skills;
  standup: typeof standup;
  subscriptions: typeof subscriptions;
  tasks: typeof tasks;
  utils: typeof utils;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
