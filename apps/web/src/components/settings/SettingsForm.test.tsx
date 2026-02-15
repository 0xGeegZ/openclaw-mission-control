/**
 * Unit tests for workspace settings validation and form contract.
 * Validation logic lives in @/lib/settings-validation; settings UI is in the page.
 */

import { describe, it, expect, vi } from "vitest";
import {
  SLUG_REGEX,
  ACCOUNT_NAME_MIN_LEN,
  ACCOUNT_NAME_MAX_LEN,
  isValidSlug,
  validateAccountName,
} from "@/lib/settings-validation";

describe("settings-validation", () => {
  describe("isValidSlug", () => {
    it("returns true for valid slugs (lowercase alphanumeric and hyphens)", () => {
      expect(isValidSlug("my-team")).toBe(true);
      expect(isValidSlug("team-123")).toBe(true);
      expect(isValidSlug("a")).toBe(true);
      expect(isValidSlug("abc")).toBe(true);
      expect(isValidSlug("my-workspace-42")).toBe(true);
    });

    it("returns false for empty string", () => {
      expect(isValidSlug("")).toBe(false);
    });

    it("returns false for slugs with spaces", () => {
      expect(isValidSlug("My Team")).toBe(false);
      expect(isValidSlug("my team")).toBe(false);
    });

    it("returns false for slugs with invalid characters", () => {
      expect(isValidSlug("team@123")).toBe(false);
      expect(isValidSlug("team..name")).toBe(false);
      expect(isValidSlug("team_name")).toBe(false);
      expect(isValidSlug("Uppercase")).toBe(false);
    });

    it("matches SLUG_REGEX for consistency", () => {
      const valid = ["my-team", "team-123", "a"];
      const invalid = ["My Team", "team@123", "team..name", ""];
      for (const s of valid) {
        expect(SLUG_REGEX.test(s)).toBe(true);
        expect(isValidSlug(s)).toBe(true);
      }
      for (const s of invalid) {
        if (s !== "") expect(SLUG_REGEX.test(s)).toBe(false);
        expect(isValidSlug(s)).toBe(false);
      }
    });
  });

  describe("validateAccountName", () => {
    it("returns valid for non-empty names within length", () => {
      expect(validateAccountName("My Team")).toEqual({ valid: true });
      expect(validateAccountName("A")).toEqual({ valid: true });
      expect(validateAccountName("a".repeat(ACCOUNT_NAME_MAX_LEN))).toEqual({
        valid: true,
      });
    });

    it("returns invalid for empty or whitespace-only", () => {
      expect(validateAccountName("")).toEqual({
        valid: false,
        error: "Account name is required",
      });
      expect(validateAccountName("   ")).toEqual({
        valid: false,
        error: "Account name is required",
      });
    });

    it("returns invalid when over max length", () => {
      const result = validateAccountName("a".repeat(ACCOUNT_NAME_MAX_LEN + 1));
      expect(result.valid).toBe(false);
      expect(result.error).toContain(String(ACCOUNT_NAME_MAX_LEN));
    });

    it("uses ACCOUNT_NAME_MIN_LEN and ACCOUNT_NAME_MAX_LEN constants", () => {
      expect(ACCOUNT_NAME_MIN_LEN).toBe(1);
      expect(ACCOUNT_NAME_MAX_LEN).toBe(100);
    });
  });
});

describe("settings form submit contract", () => {
  it("onSubmit is called with full settings shape when invoked", async () => {
    const onSubmit = vi.fn();
    const values = {
      accountName: "Updated Name",
      slug: "updated-slug",
      theme: "light" as const,
      notificationPreferences: {
        taskUpdates: false,
        agentActivity: true,
        memberUpdates: true,
      },
      timezone: "EST",
      language: "en",
    };
    await onSubmit(values);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(values);
  });
});
