/**
 * Auto Mode routing logic for agent and model selection based on task complexity.
 *
 * This module provides functions to:
 * - Get recommended agents based on complexity
 * - Get recommended models based on complexity
 * - Auto-detect complexity from task title/description (basic heuristic)
 */
import {
  TASK_COMPLEXITY,
  AGENT_COMPLEXITY_ROUTING,
  MODEL_COMPLEXITY_ROUTING,
  type TaskComplexity,
} from "./constants";

/**
 * Get recommended agent slugs for a given complexity level.
 *
 * @param complexity - Task complexity level
 * @returns Tuple of [primary, secondary] agent slugs
 */
export function getAgentRouting(
  complexity: TaskComplexity,
): readonly [string, string] {
  return AGENT_COMPLEXITY_ROUTING[complexity];
}

/**
 * Get recommended model IDs for a given complexity level.
 *
 * @param complexity - Task complexity level
 * @returns Tuple of [primary, secondary] model IDs
 */
export function getModelRouting(
  complexity: TaskComplexity,
): readonly [string, string] {
  return MODEL_COMPLEXITY_ROUTING[complexity];
}

/**
 * Auto-detect complexity from task title and description.
 * Uses basic heuristics (keyword matching).
 *
 * @param title - Task title
 * @param description - Optional task description
 * @returns Detected complexity level (defaults to MEDIUM)
 */
export function autoDetectComplexity(
  title: string,
  description?: string,
): TaskComplexity {
  const text = `${title} ${description ?? ""}`.toLowerCase();

  // Hard complexity indicators
  const hardKeywords = [
    "architecture",
    "system design",
    "security audit",
    "performance optimization",
    "migration",
    "refactor entire",
    "rebuild",
    "complex",
    "multi-service",
    "distributed",
  ];
  if (hardKeywords.some((kw) => text.includes(kw))) {
    return TASK_COMPLEXITY.HARD;
  }

  // Complex complexity indicators
  const complexKeywords = [
    "api",
    "database",
    "integration",
    "refactor",
    "bug fix",
    "debug",
    "implementation",
    "feature",
    "authentication",
    "authorization",
  ];
  if (complexKeywords.some((kw) => text.includes(kw))) {
    return TASK_COMPLEXITY.COMPLEX;
  }

  // Easy complexity indicators
  const easyKeywords = [
    "typo",
    "update text",
    "change text",
    "fix text",
    "content",
    "copy",
    "design",
    "logo",
    "image",
    "banner",
    "simple",
  ];
  if (easyKeywords.some((kw) => text.includes(kw))) {
    return TASK_COMPLEXITY.EASY;
  }

  // Default to medium
  return TASK_COMPLEXITY.MEDIUM;
}

/**
 * Get routing info for a task (agents and models).
 * Used by the UI or assignment logic.
 */
export function getRoutingInfo(complexity: TaskComplexity): {
  agents: readonly [string, string];
  models: readonly [string, string];
} {
  return {
    agents: getAgentRouting(complexity),
    models: getModelRouting(complexity),
  };
}
