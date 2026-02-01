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
import type * as documents from "../documents.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_mentions from "../lib/mentions.js";
import type * as lib_notifications from "../lib/notifications.js";
import type * as lib_service_auth from "../lib/service_auth.js";
import type * as lib_task_workflow from "../lib/task_workflow.js";
import type * as lib_validators from "../lib/validators.js";
import type * as memberships from "../memberships.js";
import type * as messages from "../messages.js";
import type * as notifications from "../notifications.js";
import type * as service_actions from "../service/actions.js";
import type * as service_agents from "../service/agents.js";
import type * as service_documents from "../service/documents.js";
import type * as service_messages from "../service/messages.js";
import type * as service_notifications from "../service/notifications.js";
import type * as service_tasks from "../service/tasks.js";
import type * as skills from "../skills.js";
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
  documents: typeof documents;
  "lib/activity": typeof lib_activity;
  "lib/auth": typeof lib_auth;
  "lib/mentions": typeof lib_mentions;
  "lib/notifications": typeof lib_notifications;
  "lib/service_auth": typeof lib_service_auth;
  "lib/task_workflow": typeof lib_task_workflow;
  "lib/validators": typeof lib_validators;
  memberships: typeof memberships;
  messages: typeof messages;
  notifications: typeof notifications;
  "service/actions": typeof service_actions;
  "service/agents": typeof service_agents;
  "service/documents": typeof service_documents;
  "service/messages": typeof service_messages;
  "service/notifications": typeof service_notifications;
  "service/tasks": typeof service_tasks;
  skills: typeof skills;
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
