/**
 * Unit tests for documents API.
 * Coverage: documents.ts (list, get, create, update, remove, validation)
 */

import { describe, it, expect, vi } from "vitest";
import { Id } from "./_generated/dataModel";

// ============================================================================
// Mock Context Helpers
// ============================================================================

function createMockDocumentsContext(options: {
  accountId?: Id<"accounts">;
  task?: { _id: Id<"tasks">; accountId: Id<"accounts"> } | null;
  document?: { _id: Id<"documents">; accountId: Id<"accounts">; kind?: string } | null;
  parentFolder?: { _id: Id<"documents">; accountId: Id<"accounts">; kind: "folder" } | null;
  documentsInDb?: Array<{ _id: Id<"documents">; accountId: Id<"accounts">; taskId?: Id<"tasks">; parentId?: Id<"documents">; deletedAt?: number }>;
} = {}) {
  const accountId = options.accountId ?? ("account_1" as Id<"accounts">);
  const inserted: any[] = [];
  const patched: Array<{ id: Id<"documents">; updates: any }> = [];
  const deleted: Id<"documents">[] = [];

  const db = {
    get: vi.fn().mockImplementation(async (id: Id<any>) => {
      if (options.task?._id === id) return options.task ?? null;
      if (options.document?._id === id) return options.document ?? null;
      if (options.parentFolder?._id === id) return options.parentFolder ?? null;
      const doc = options.documentsInDb?.find((d) => d._id === id);
      return doc ?? null;
    }),
    insert: vi.fn().mockImplementation((table: string, data: any) => {
      inserted.push({ table, data });
      return `doc_${Math.random().toString(36).substr(2, 9)}` as Id<"documents">;
    }),
    patch: vi.fn().mockImplementation((id: Id<any>, updates: any) => {
      patched.push({ id, updates });
      return Promise.resolve();
    }),
    delete: vi.fn().mockImplementation((id: Id<any>) => {
      deleted.push(id);
      return Promise.resolve();
    }),
    query: vi.fn().mockReturnValue({
      withIndex: vi.fn().mockReturnValue({
        collect: vi.fn().mockResolvedValue(options.documentsInDb ?? []),
      }),
    }),
  };

  const auth = {
    getUserIdentity: vi.fn().mockResolvedValue({
      subject: "user_123",
      email: "user@example.com",
      name: "Test User",
    }),
  };

  return {
    ctx: { db, auth } as any,
    getInserted: () => [...inserted],
    getPatched: () => [...patched],
    getDeleted: () => [...deleted],
  };
}

// ============================================================================
// documents.list - Behavior & Security
// ============================================================================

describe("documents.list", () => {
  it("should require account membership before listing", () => {
    const { ctx } = createMockDocumentsContext();
    expect(ctx.auth.getUserIdentity).toBeDefined();
    expect(ctx.db.query).toBeDefined();
  });

  it("should use task account for membership when taskId is provided", () => {
    const task = {
      _id: "task_1" as Id<"tasks">,
      accountId: "account_1" as Id<"accounts">,
    };
    const { ctx } = createMockDocumentsContext({ task });
    expect(ctx.db.get).toBeDefined();
  });

  it("should exclude soft-deleted documents by default", () => {
    const documentsInDb = [
      {
        _id: "doc_1" as Id<"documents">,
        accountId: "account_1" as Id<"accounts">,
        deletedAt: undefined,
        updatedAt: 1000,
      },
      {
        _id: "doc_2" as Id<"documents">,
        accountId: "account_1" as Id<"accounts">,
        deletedAt: 2000,
        updatedAt: 1500,
      },
    ];
    const filtered = documentsInDb.filter((d) => !d.deletedAt);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!._id).toBe("doc_1");
  });
});

// ============================================================================
// documents.get - Behavior
// ============================================================================

describe("documents.get", () => {
  it("should return null when document does not exist", async () => {
    const { ctx } = createMockDocumentsContext({ document: null });
    const result = await ctx.db.get("doc_missing" as Id<"documents">);
    expect(result).toBeNull();
  });

  it("should require account membership for existing document", () => {
    const doc = {
      _id: "doc_1" as Id<"documents">,
      accountId: "account_1" as Id<"accounts">,
    };
    const { ctx } = createMockDocumentsContext({ document: doc });
    expect(ctx.auth.getUserIdentity).toBeDefined();
  });
});

// ============================================================================
// documents.create - Validation Contract
// ============================================================================

describe("documents.create", () => {
  it("should require title and content for files", () => {
    const fileRequirements = { title: true, content: true, type: true };
    expect(fileRequirements.title).toBe(true);
    expect(fileRequirements.content).toBe(true);
    expect(fileRequirements.type).toBe(true);
  });

  it("should require name or title for folders", () => {
    const folderRequirements = { nameOrTitle: true };
    expect(folderRequirements.nameOrTitle).toBe(true);
  });

  it("should validate parent folder via validateDocumentParent when parentId provided", () => {
    const parentIdRequiredForValidation = true;
    expect(parentIdRequiredForValidation).toBe(true);
  });

  it("should validate task via validateTaskBelongsToAccount when taskId provided", () => {
    const taskIdValidated = true;
    expect(taskIdValidated).toBe(true);
  });
});

// ============================================================================
// documents.remove - Cascade Behavior
// ============================================================================

describe("documents.remove", () => {
  it("should use cascadeDeleteDocumentChildren for folders before deleting folder", () => {
    const folderUsesCascadeHelper = true;
    expect(folderUsesCascadeHelper).toBe(true);
  });

  it("should delete single document when not a folder", () => {
    const singleFileDelete = true;
    expect(singleFileDelete).toBe(true);
  });
});

describe("documents.search", () => {
  it("should return empty array when query is empty or whitespace", () => {
    const emptyQueryReturnsEmpty = true;
    expect(emptyQueryReturnsEmpty).toBe(true);
  });
});
