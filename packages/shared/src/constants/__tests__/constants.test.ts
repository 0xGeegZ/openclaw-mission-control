import { describe, it, expect } from "vitest";
import {
  TASK_STATUS_ORDER,
  TASK_STATUS_LABELS,
  TASK_STATUS_TRANSITIONS,
  AGENT_STATUS_ORDER,
  AVAILABLE_MODELS,
  getModelProviderLabel,
  MODEL_PROVIDER_LABELS,
  MODEL_TO_OPENCLAW,
  OPENCLAW_FALLBACK_MODEL,
  SKILL_CATEGORY_LABELS,
  DEFAULT_OPENCLAW_CONFIG,
  ANALYTICS_TIME_RANGE,
  ANALYTICS_TIME_RANGE_ORDER,
  ANALYTICS_TIME_RANGE_LABELS,
  TASK_STATUS_CHART_COLORS,
  AGENT_STATUS_CHART_COLORS,
} from "../index";
import type {
  TaskStatus,
  AnalyticsTimeRange,
  SkillCategory,
} from "../../types";

// ============================================================================
// Task Status Constants Tests
// ============================================================================

describe("TASK_STATUS_ORDER", () => {
  const allStatuses: TaskStatus[] = [
    "inbox",
    "assigned",
    "in_progress",
    "review",
    "done",
    "blocked",
    "archived",
  ];

  it("contains only valid statuses", () => {
    for (const status of TASK_STATUS_ORDER) {
      expect(allStatuses).toContain(status);
    }
  });

  it("has inbox as the first status", () => {
    expect(TASK_STATUS_ORDER[0]).toBe("inbox");
  });

  it("has archived as the final status in order", () => {
    expect(TASK_STATUS_ORDER[TASK_STATUS_ORDER.length - 1]).toBe("archived");
  });

  it("has a logical progression (inbox → assigned → in_progress → review → done → blocked → archived)", () => {
    const expectedOrder = [
      "inbox",
      "assigned",
      "in_progress",
      "review",
      "done",
      "blocked",
      "archived",
    ];
    expect(TASK_STATUS_ORDER).toEqual(expectedOrder);
  });

  it("contains at least 5 statuses", () => {
    expect(TASK_STATUS_ORDER.length).toBeGreaterThanOrEqual(5);
  });
});

describe("TASK_STATUS_LABELS", () => {
  const allStatuses: TaskStatus[] = [
    "inbox",
    "assigned",
    "in_progress",
    "review",
    "done",
    "blocked",
    "archived",
  ];

  it("has an entry for every TaskStatus", () => {
    for (const status of allStatuses) {
      expect(TASK_STATUS_LABELS[status]).toBeDefined();
    }
  });

  it("all labels are non-empty strings", () => {
    for (const status of allStatuses) {
      expect(typeof TASK_STATUS_LABELS[status]).toBe("string");
      expect(TASK_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it("contains human-readable labels with proper capitalization", () => {
    expect(TASK_STATUS_LABELS.inbox).toBe("Inbox");
    expect(TASK_STATUS_LABELS.assigned).toBe("Assigned");
    expect(TASK_STATUS_LABELS.in_progress).toBe("In Progress");
    expect(TASK_STATUS_LABELS.review).toBe("Review");
    expect(TASK_STATUS_LABELS.done).toBe("Done");
    expect(TASK_STATUS_LABELS.blocked).toBe("Blocked");
    expect(TASK_STATUS_LABELS.archived).toBe("Archived");
  });

  it("does not have empty or whitespace-only labels", () => {
    for (const label of Object.values(TASK_STATUS_LABELS)) {
      expect(label.trim()).not.toBe("");
    }
  });

  it("has exactly 7 labels (one for each status)", () => {
    expect(Object.keys(TASK_STATUS_LABELS).length).toBe(7);
  });
});

describe("TASK_STATUS_TRANSITIONS", () => {
  const allStatuses: TaskStatus[] = [
    "inbox",
    "assigned",
    "in_progress",
    "review",
    "done",
    "blocked",
    "archived",
  ];

  it("has an entry for every TaskStatus", () => {
    for (const status of allStatuses) {
      expect(TASK_STATUS_TRANSITIONS[status]).toBeDefined();
      expect(Array.isArray(TASK_STATUS_TRANSITIONS[status])).toBe(true);
    }
  });

  it("all transition targets are valid statuses", () => {
    for (const status of allStatuses) {
      const transitions = TASK_STATUS_TRANSITIONS[status];
      for (const target of transitions) {
        expect(allStatuses).toContain(target);
      }
    }
  });

  it("inbox can transition to assigned or archived", () => {
    expect(TASK_STATUS_TRANSITIONS.inbox).toEqual(["assigned", "archived"]);
  });

  it("assigned can transition to in_progress, blocked, inbox, or archived", () => {
    expect(TASK_STATUS_TRANSITIONS.assigned).toContain("in_progress");
    expect(TASK_STATUS_TRANSITIONS.assigned).toContain("blocked");
    expect(TASK_STATUS_TRANSITIONS.assigned).toContain("inbox");
    expect(TASK_STATUS_TRANSITIONS.assigned).toContain("archived");
    expect(TASK_STATUS_TRANSITIONS.assigned.length).toBe(4);
  });

  it("in_progress can transition to review, blocked, or archived", () => {
    expect(TASK_STATUS_TRANSITIONS.in_progress).toContain("review");
    expect(TASK_STATUS_TRANSITIONS.in_progress).toContain("blocked");
    expect(TASK_STATUS_TRANSITIONS.in_progress).toContain("archived");
    expect(TASK_STATUS_TRANSITIONS.in_progress.length).toBe(3);
  });

  it("review can transition to done, in_progress, blocked, or archived", () => {
    expect(TASK_STATUS_TRANSITIONS.review).toContain("in_progress");
    expect(TASK_STATUS_TRANSITIONS.review).toContain("done");
    expect(TASK_STATUS_TRANSITIONS.review).toContain("blocked");
    expect(TASK_STATUS_TRANSITIONS.review).toContain("archived");
    expect(TASK_STATUS_TRANSITIONS.review.length).toBe(4);
  });

  it("done can transition to archived", () => {
    expect(TASK_STATUS_TRANSITIONS.done).toEqual(["archived"]);
  });

  it("blocked can transition to assigned, in_progress, or archived", () => {
    expect(TASK_STATUS_TRANSITIONS.blocked).toContain("assigned");
    expect(TASK_STATUS_TRANSITIONS.blocked).toContain("in_progress");
    expect(TASK_STATUS_TRANSITIONS.blocked).toContain("archived");
    expect(TASK_STATUS_TRANSITIONS.blocked.length).toBe(3);
  });

  it("archived is a terminal state (no transitions)", () => {
    expect(TASK_STATUS_TRANSITIONS.archived).toEqual([]);
  });

  it("no status can transition to itself", () => {
    for (const status of allStatuses) {
      expect(TASK_STATUS_TRANSITIONS[status]).not.toContain(status);
    }
  });

  it("all transition arrays contain only valid statuses (no typos)", () => {
    const validStatuses = new Set(allStatuses);
    for (const transitions of Object.values(TASK_STATUS_TRANSITIONS)) {
      for (const target of transitions) {
        expect(validStatuses.has(target)).toBe(true);
      }
    }
  });
});

// ============================================================================
// LLM Models Constants Tests
// ============================================================================

describe("AVAILABLE_MODELS", () => {
  it("is defined and is an array", () => {
    expect(Array.isArray(AVAILABLE_MODELS)).toBe(true);
    expect(AVAILABLE_MODELS.length).toBeGreaterThan(0);
  });

  it("contains objects with value and label properties", () => {
    for (const model of AVAILABLE_MODELS) {
      expect(model).toHaveProperty("value");
      expect(model).toHaveProperty("label");
      expect(typeof model.value).toBe("string");
      expect(typeof model.label).toBe("string");
    }
  });

  it("all models have non-empty values and labels", () => {
    for (const model of AVAILABLE_MODELS) {
      expect(model.value.length).toBeGreaterThan(0);
      expect(model.label.length).toBeGreaterThan(0);
    }
  });

  it("includes the default model (minimax-m2.5)", () => {
    const hasDefaultModel = AVAILABLE_MODELS.some(
      (m) => m.value === "minimax-m2.5",
    );
    expect(hasDefaultModel).toBe(true);
  });

  it("default model is marked as recommended in the label", () => {
    const defaultModel = AVAILABLE_MODELS.find(
      (m) => m.value === "minimax-m2.5",
    );
    expect(defaultModel).toBeDefined();
    expect(defaultModel!.label).toContain("Recommended");
  });

  it("has exactly 4 model options", () => {
    expect(AVAILABLE_MODELS.length).toBe(4);
  });

  it("first model is the default OpenClaw config model", () => {
    expect(AVAILABLE_MODELS[0].value).toBe(DEFAULT_OPENCLAW_CONFIG.model);
  });

  it("model values are unique", () => {
    const values = AVAILABLE_MODELS.map((m) => m.value);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });

  it("every model has a MODEL_TO_OPENCLAW mapping", () => {
    for (const model of AVAILABLE_MODELS) {
      expect(MODEL_TO_OPENCLAW[model.value]).toBeDefined();
      expect(typeof MODEL_TO_OPENCLAW[model.value]).toBe("string");
      expect(MODEL_TO_OPENCLAW[model.value].length).toBeGreaterThan(0);
    }
  });

  it("OPENCLAW_FALLBACK_MODEL matches the second model (Haiku) OpenClaw mapping", () => {
    const secondModelValue = AVAILABLE_MODELS[1].value;
    expect(OPENCLAW_FALLBACK_MODEL).toBe(MODEL_TO_OPENCLAW[secondModelValue]);
  });
});

// ============================================================================
// MODEL_PROVIDER_LABELS and getModelProviderLabel Tests
// ============================================================================

describe("MODEL_PROVIDER_LABELS", () => {
  it("has an entry for every AVAILABLE_MODELS value", () => {
    for (const model of AVAILABLE_MODELS) {
      expect(MODEL_PROVIDER_LABELS[model.value]).toBeDefined();
      expect(typeof MODEL_PROVIDER_LABELS[model.value]).toBe("string");
      expect(MODEL_PROVIDER_LABELS[model.value].length).toBeGreaterThan(0);
    }
  });
});

describe("getModelProviderLabel", () => {
  it("returns provider label for each known model value", () => {
    expect(getModelProviderLabel("minimax-m2.5")).toBe("Minimax");
    expect(getModelProviderLabel("claude-haiku-4.5")).toBe("Anthropic");
    expect(getModelProviderLabel("kimi-k2.5")).toBe("Moonshot AI");
    expect(getModelProviderLabel("gpt-5-nano")).toBe("OpenAI");
  });

  it("returns Other for unknown model value", () => {
    expect(getModelProviderLabel("unknown-model")).toBe("Other");
    expect(getModelProviderLabel("claude-3-opus")).toBe("Other");
  });

  it("returns Other for empty or whitespace", () => {
    expect(getModelProviderLabel("")).toBe("Other");
    expect(getModelProviderLabel("   ")).toBe("Other");
  });

  it("trims input before lookup", () => {
    expect(getModelProviderLabel("  minimax-m2.5  ")).toBe("Minimax");
  });
});

// ============================================================================
// Skill Category Constants Tests
// ============================================================================

describe("SKILL_CATEGORY_LABELS", () => {
  const expectedCategories: SkillCategory[] = [
    "mcp_server",
    "tool",
    "integration",
    "custom",
  ];

  it("is defined and is an object", () => {
    expect(typeof SKILL_CATEGORY_LABELS).toBe("object");
    expect(SKILL_CATEGORY_LABELS).not.toBeNull();
  });

  it("has an entry for every expected skill category", () => {
    for (const category of expectedCategories) {
      expect(SKILL_CATEGORY_LABELS[category]).toBeDefined();
    }
  });

  it("all labels are non-empty strings", () => {
    for (const label of Object.values(SKILL_CATEGORY_LABELS)) {
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("contains human-readable labels for each category", () => {
    expect(SKILL_CATEGORY_LABELS.mcp_server).toBe("MCP Server");
    expect(SKILL_CATEGORY_LABELS.tool).toBe("Tool");
    expect(SKILL_CATEGORY_LABELS.integration).toBe("Integration");
    expect(SKILL_CATEGORY_LABELS.custom).toBe("Custom");
  });

  it("has exactly 4 category entries", () => {
    expect(Object.keys(SKILL_CATEGORY_LABELS).length).toBe(4);
  });
});

// ============================================================================
// Default OpenClaw Config Tests
// ============================================================================

describe("DEFAULT_OPENCLAW_CONFIG", () => {
  it("is defined and is an object", () => {
    expect(typeof DEFAULT_OPENCLAW_CONFIG).toBe("object");
    expect(DEFAULT_OPENCLAW_CONFIG).not.toBeNull();
  });

  it("has all required top-level properties", () => {
    expect(DEFAULT_OPENCLAW_CONFIG).toHaveProperty("model");
    expect(DEFAULT_OPENCLAW_CONFIG).toHaveProperty("temperature");
    expect(DEFAULT_OPENCLAW_CONFIG).toHaveProperty("maxTokens");
    expect(DEFAULT_OPENCLAW_CONFIG).toHaveProperty("skillIds");
    expect(DEFAULT_OPENCLAW_CONFIG).toHaveProperty("contextConfig");
    expect(DEFAULT_OPENCLAW_CONFIG).toHaveProperty("behaviorFlags");
  });

  it("has model set to an available model", () => {
    const validModels = AVAILABLE_MODELS.map((m) => m.value);
    expect(validModels).toContain(DEFAULT_OPENCLAW_CONFIG.model);
  });

  it("has a valid temperature value (0-1)", () => {
    expect(DEFAULT_OPENCLAW_CONFIG.temperature).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_OPENCLAW_CONFIG.temperature).toBeLessThanOrEqual(1);
  });

  it("has maxTokens as a positive number", () => {
    expect(typeof DEFAULT_OPENCLAW_CONFIG.maxTokens).toBe("number");
    expect(DEFAULT_OPENCLAW_CONFIG.maxTokens).toBeGreaterThan(0);
  });

  it("skillIds is initialized as an empty array", () => {
    expect(Array.isArray(DEFAULT_OPENCLAW_CONFIG.skillIds)).toBe(true);
    expect(DEFAULT_OPENCLAW_CONFIG.skillIds.length).toBe(0);
  });

  it("contextConfig has all required nested properties", () => {
    expect(DEFAULT_OPENCLAW_CONFIG.contextConfig).toHaveProperty(
      "maxHistoryMessages",
    );
    expect(DEFAULT_OPENCLAW_CONFIG.contextConfig).toHaveProperty(
      "includeTaskContext",
    );
    expect(DEFAULT_OPENCLAW_CONFIG.contextConfig).toHaveProperty(
      "includeTeamContext",
    );
  });

  it("contextConfig.maxHistoryMessages is a positive number", () => {
    expect(
      typeof DEFAULT_OPENCLAW_CONFIG.contextConfig.maxHistoryMessages,
    ).toBe("number");
    expect(
      DEFAULT_OPENCLAW_CONFIG.contextConfig.maxHistoryMessages,
    ).toBeGreaterThan(0);
  });

  it("contextConfig flags are boolean values", () => {
    expect(
      typeof DEFAULT_OPENCLAW_CONFIG.contextConfig.includeTaskContext,
    ).toBe("boolean");
    expect(
      typeof DEFAULT_OPENCLAW_CONFIG.contextConfig.includeTeamContext,
    ).toBe("boolean");
  });

  it("behaviorFlags has all required properties", () => {
    expect(DEFAULT_OPENCLAW_CONFIG.behaviorFlags).toHaveProperty(
      "canCreateTasks",
    );
    expect(DEFAULT_OPENCLAW_CONFIG.behaviorFlags).toHaveProperty(
      "canModifyTaskStatus",
    );
    expect(DEFAULT_OPENCLAW_CONFIG.behaviorFlags).toHaveProperty(
      "canCreateDocuments",
    );
    expect(DEFAULT_OPENCLAW_CONFIG.behaviorFlags).toHaveProperty(
      "canMentionAgents",
    );
    expect(DEFAULT_OPENCLAW_CONFIG.behaviorFlags).toHaveProperty(
      "canReviewTasks",
    );
    expect(DEFAULT_OPENCLAW_CONFIG.behaviorFlags).toHaveProperty(
      "canMarkDone",
    );
  });

  it("behaviorFlags are all boolean values", () => {
    expect(typeof DEFAULT_OPENCLAW_CONFIG.behaviorFlags.canCreateTasks).toBe(
      "boolean",
    );
    expect(
      typeof DEFAULT_OPENCLAW_CONFIG.behaviorFlags.canModifyTaskStatus,
    ).toBe("boolean");
    expect(
      typeof DEFAULT_OPENCLAW_CONFIG.behaviorFlags.canCreateDocuments,
    ).toBe("boolean");
    expect(typeof DEFAULT_OPENCLAW_CONFIG.behaviorFlags.canMentionAgents).toBe(
      "boolean",
    );
    expect(typeof DEFAULT_OPENCLAW_CONFIG.behaviorFlags.canReviewTasks).toBe(
      "boolean",
    );
    expect(typeof DEFAULT_OPENCLAW_CONFIG.behaviorFlags.canMarkDone).toBe(
      "boolean",
    );
  });

  it("canModifyTaskStatus is enabled by default for agents", () => {
    expect(DEFAULT_OPENCLAW_CONFIG.behaviorFlags.canModifyTaskStatus).toBe(
      true,
    );
  });

  it("canCreateTasks is disabled by default for security", () => {
    expect(DEFAULT_OPENCLAW_CONFIG.behaviorFlags.canCreateTasks).toBe(false);
  });

  it("behaviorFlags canReviewTasks and canMarkDone default to false", () => {
    expect(DEFAULT_OPENCLAW_CONFIG.behaviorFlags.canReviewTasks).toBe(false);
    expect(DEFAULT_OPENCLAW_CONFIG.behaviorFlags.canMarkDone).toBe(false);
  });
});

// ============================================================================
// Analytics Time Range Constants
// ============================================================================

describe("ANALYTICS_TIME_RANGE_ORDER", () => {
  it("contains only day, week, month (no custom in tab order)", () => {
    expect(ANALYTICS_TIME_RANGE_ORDER).toEqual([
      ANALYTICS_TIME_RANGE.DAY,
      ANALYTICS_TIME_RANGE.WEEK,
      ANALYTICS_TIME_RANGE.MONTH,
    ]);
  });

  it("has exactly 3 entries for dashboard tabs", () => {
    expect(ANALYTICS_TIME_RANGE_ORDER.length).toBe(3);
  });
});

describe("ANALYTICS_TIME_RANGE_LABELS", () => {
  const allRanges: AnalyticsTimeRange[] = [
    ANALYTICS_TIME_RANGE.DAY,
    ANALYTICS_TIME_RANGE.WEEK,
    ANALYTICS_TIME_RANGE.MONTH,
    ANALYTICS_TIME_RANGE.CUSTOM,
  ];

  it("has an entry for every AnalyticsTimeRange", () => {
    for (const range of allRanges) {
      expect(ANALYTICS_TIME_RANGE_LABELS[range]).toBeDefined();
    }
  });

  it("all labels are non-empty strings", () => {
    for (const range of allRanges) {
      expect(typeof ANALYTICS_TIME_RANGE_LABELS[range]).toBe("string");
      expect(ANALYTICS_TIME_RANGE_LABELS[range].length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Chart Color Constants
// ============================================================================

describe("TASK_STATUS_CHART_COLORS", () => {
  it("has an entry for every TaskStatus", () => {
    for (const status of TASK_STATUS_ORDER) {
      expect(TASK_STATUS_CHART_COLORS[status]).toBeDefined();
      expect(TASK_STATUS_CHART_COLORS[status]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("AGENT_STATUS_CHART_COLORS", () => {
  it("has an entry for every AgentStatus", () => {
    for (const status of AGENT_STATUS_ORDER) {
      expect(AGENT_STATUS_CHART_COLORS[status]).toBeDefined();
      expect(AGENT_STATUS_CHART_COLORS[status]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
