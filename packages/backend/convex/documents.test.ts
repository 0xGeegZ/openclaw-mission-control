import { describe, expect, it } from "vitest";

import { ensureDocumentIsActive, getDocumentDisplayName } from "./documents";

describe("documents helpers", () => {
  describe("getDocumentDisplayName", () => {
    it("prefers name over title", () => {
      expect(
        getDocumentDisplayName({
          name: "Folder A",
          title: "Ignored Title",
        }),
      ).toBe("Folder A");
    });

    it("falls back to title when name is missing", () => {
      expect(
        getDocumentDisplayName({
          title: "Document Title",
        }),
      ).toBe("Document Title");
    });

    it("uses provided fallback when both are missing", () => {
      expect(getDocumentDisplayName({}, "Untitled")).toBe("Untitled");
    });
  });

  describe("ensureDocumentIsActive", () => {
    it("does not throw for active documents", () => {
      expect(() =>
        ensureDocumentIsActive(
          {
            deletedAt: undefined,
          },
          "update",
        ),
      ).not.toThrow();
    });

    it("throws for soft-deleted documents", () => {
      expect(() =>
        ensureDocumentIsActive(
          {
            deletedAt: Date.now(),
          },
          "duplicate document",
        ),
      ).toThrow("Cannot duplicate document: Document has been deleted");
    });
  });
});
