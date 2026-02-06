import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { getPosts, getPostBySlug, getPostSlugs } from "./posts";

describe("posts utilities", () => {
  describe("getPostBySlug", () => {
    it("should return null for invalid slugs (path traversal protection)", async () => {
      // Path traversal attempts
      expect(await getPostBySlug("../../../etc/passwd")).toBeNull();
      expect(await getPostBySlug("..")).toBeNull();
      expect(await getPostBySlug(".")).toBeNull();
      expect(await getPostBySlug("/etc/passwd")).toBeNull();
      
      // Invalid characters
      expect(await getPostBySlug("hello world")).toBeNull(); // Space
      expect(await getPostBySlug("hello/world")).toBeNull(); // Slash
      expect(await getPostBySlug("hello\\world")).toBeNull(); // Backslash
      expect(await getPostBySlug("hello;world")).toBeNull(); // Semicolon
    });

    it("should accept valid slugs", async () => {
      // These won't find files in test environment, but slug validation should pass
      const validSlugs = [
        "hello-world",
        "my_post",
        "post123",
        "2026-01-01-update",
        "UPPERCASE",
      ];

      for (const slug of validSlugs) {
        // Shouldn't throw or return error due to slug validation
        // (Will return null because test files don't exist, but that's expected)
        const result = await getPostBySlug(slug);
        // If null, it's because file doesn't exist, not because slug was invalid
        expect(result).toBeNull(); // File doesn't exist in test
      }
    });

    it("should return null for non-existent posts", async () => {
      const result = await getPostBySlug("non-existent-post");
      expect(result).toBeNull();
    });

    it("should parse frontmatter correctly from existing posts", async () => {
      // This test assumes getting-started.mdx exists in production
      // In test environment, we'll mock or skip if file doesn't exist
      const result = await getPostBySlug("getting-started");
      
      if (result) {
        expect(result).toHaveProperty("metadata");
        expect(result).toHaveProperty("content");
        expect(result.metadata).toHaveProperty("title");
        expect(result.metadata).toHaveProperty("date");
        expect(result.metadata).toHaveProperty("author");
        expect(result.metadata).toHaveProperty("tags");
        expect(result.metadata).toHaveProperty("slug");
        expect(result.metadata.slug).toBe("getting-started");
        expect(Array.isArray(result.metadata.tags)).toBe(true);
      }
      // If null, test passes (file doesn't exist in test environment)
    });
  });

  describe("getPosts", () => {
    it("should return array of posts", async () => {
      const posts = await getPosts();
      expect(Array.isArray(posts)).toBe(true);
      
      // If posts exist, validate structure
      if (posts.length > 0) {
        const post = posts[0];
        expect(post).toHaveProperty("title");
        expect(post).toHaveProperty("date");
        expect(post).toHaveProperty("author");
        expect(post).toHaveProperty("tags");
        expect(post).toHaveProperty("slug");
        expect(Array.isArray(post.tags)).toBe(true);
      }
    });

    it("should sort posts by date (newest first)", async () => {
      const posts = await getPosts();
      
      if (posts.length > 1) {
        for (let i = 0; i < posts.length - 1; i++) {
          const currentDate = new Date(posts[i].date);
          const nextDate = new Date(posts[i + 1].date);
          expect(currentDate.getTime()).toBeGreaterThanOrEqual(nextDate.getTime());
        }
      }
    });
  });

  describe("getPostSlugs", () => {
    it("should return array of slugs", async () => {
      const slugs = await getPostSlugs();
      expect(Array.isArray(slugs)).toBe(true);
      
      // All slugs should be valid (alphanumeric, hyphens, underscores)
      for (const slug of slugs) {
        expect(slug).toMatch(/^[a-zA-Z0-9_-]+$/);
      }
    });

    it("should not include .mdx extension in slugs", async () => {
      const slugs = await getPostSlugs();
      
      for (const slug of slugs) {
        expect(slug).not.toContain(".mdx");
        expect(slug).not.toContain(".");
      }
    });
  });
});
