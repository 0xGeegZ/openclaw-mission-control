/**
 * Unit tests for getToolCapabilitiesAndSchemas: single source of truth for capability labels and tool schemas.
 */
import { describe, it, expect } from "vitest";
import {
  getToolCapabilitiesAndSchemas,
  getToolSchemasForCapabilities,
} from "./agentTools";

function schemaNames(schemas: unknown[]): string[] {
  return schemas
    .map((s) => {
      const schema = s as { function?: { name?: string } };
      return schema?.function?.name;
    })
    .filter((n): n is string => typeof n === "string");
}

describe("getToolCapabilitiesAndSchemas", () => {
  it("returns task_status only when hasTaskContext and canModifyTaskStatus", () => {
    const withTask = getToolCapabilitiesAndSchemas({
      canCreateTasks: false,
      canModifyTaskStatus: true,
      canCreateDocuments: false,
      hasTaskContext: true,
    });
    expect(withTask.hasTaskStatus).toBe(true);
    expect(withTask.capabilityLabels).toContain(
      "change task status (task_status tool)",
    );
    expect(schemaNames(withTask.schemas)).toContain("task_status");

    const noTask = getToolCapabilitiesAndSchemas({
      canCreateTasks: false,
      canModifyTaskStatus: true,
      canCreateDocuments: false,
      hasTaskContext: false,
    });
    expect(noTask.hasTaskStatus).toBe(false);
    expect(noTask.capabilityLabels).not.toContain(
      "change task status (task_status tool)",
    );
    expect(schemaNames(noTask.schemas)).not.toContain("task_status");

    const noPermission = getToolCapabilitiesAndSchemas({
      canCreateTasks: false,
      canModifyTaskStatus: false,
      canCreateDocuments: false,
      hasTaskContext: true,
    });
    expect(noPermission.hasTaskStatus).toBe(false);
    expect(schemaNames(noPermission.schemas)).not.toContain("task_status");
  });

  it("returns task_create when canCreateTasks is true", () => {
    const result = getToolCapabilitiesAndSchemas({
      canCreateTasks: true,
      canModifyTaskStatus: false,
      canCreateDocuments: false,
      hasTaskContext: false,
    });
    expect(result.capabilityLabels).toContain(
      "create tasks (task_create tool)",
    );
    expect(schemaNames(result.schemas)).toContain("task_create");
  });

  it("returns document_upsert when canCreateDocuments is true", () => {
    const result = getToolCapabilitiesAndSchemas({
      canCreateTasks: false,
      canModifyTaskStatus: false,
      canCreateDocuments: true,
      hasTaskContext: false,
    });
    expect(result.capabilityLabels).toContain(
      "create/update documents (document_upsert tool)",
    );
    expect(schemaNames(result.schemas)).toContain("document_upsert");
  });

  it("includes orchestrator-only tools when isOrchestrator is true", () => {
    const result = getToolCapabilitiesAndSchemas({
      canCreateTasks: false,
      canModifyTaskStatus: false,
      canCreateDocuments: false,
      hasTaskContext: false,
      isOrchestrator: true,
    });
    const names = schemaNames(result.schemas);
    expect(names).toContain("task_assign");
    expect(names).toContain("task_message");
    expect(names).toContain("task_list");
    expect(names).toContain("task_get");
    expect(names).toContain("task_thread");
  });

  it("keeps capability labels and schemas in sync", () => {
    const options = {
      canCreateTasks: true,
      canModifyTaskStatus: true,
      canCreateDocuments: true,
      hasTaskContext: true,
    };
    const result = getToolCapabilitiesAndSchemas(options);
    const toolLabels = result.capabilityLabels.filter((l) =>
      l.includes(" tool)"),
    );
    expect(toolLabels.length).toBe(result.schemas.length);
    expect(schemaNames(result.schemas).length).toBe(result.schemas.length);
  });

  it("returns empty when no tool capabilities", () => {
    const result = getToolCapabilitiesAndSchemas({
      canCreateTasks: false,
      canModifyTaskStatus: false,
      canCreateDocuments: false,
      hasTaskContext: false,
    });
    expect(result.capabilityLabels).toEqual([]);
    expect(result.schemas).toEqual([]);
    expect(result.hasTaskStatus).toBe(false);
  });
});

describe("getToolSchemasForCapabilities", () => {
  it("returns same schemas as getToolCapabilitiesAndSchemas for same options", () => {
    const options = {
      canCreateTasks: true,
      canModifyTaskStatus: true,
      canCreateDocuments: true,
      hasTaskContext: true,
    };
    const fromHelper = getToolCapabilitiesAndSchemas(options).schemas;
    const fromLegacy = getToolSchemasForCapabilities(options);
    expect(fromLegacy).toEqual(fromHelper);
  });
});
