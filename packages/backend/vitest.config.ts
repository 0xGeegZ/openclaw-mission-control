/**
 * vitest.config.ts — Convex Backend Test Configuration
 * 
 * Configuration for testing the Convex backend package:
 * - Unit tests for business logic
 * - Integration tests with Convex test environment
 * - Test utilities and factories
 */
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    
    // Test file patterns
    include: [
      "**/__tests__/**/*.test.ts",
      "**/*.test.ts",
    ],
    exclude: [
      "node_modules/",
      "dist/",
      "_generated/",
    ],
    
    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      all: true,
      include: [
        "convex/**/*.ts",
      ],
      exclude: [
        "__tests__/**",
        "convex/_generated/**",
        "convex/**/*.test.ts",
        "convex/seed/**",
        "convex/README.md",
      ],
      // Thresholds that fail the build if coverage is below target
      // TODO: Improve coverage and raise thresholds
      thresholds: {
        lines: 8,
        functions: 40,
        branches: 40,
        statements: 8,
      },
    },
    
    // Setup files run before tests (outside convex/ so Convex deploy does not load vitest)
    setupFiles: ["./__tests__/setup.ts"],
    
    // Test timeout
    testTimeout: 10000,
    
    // Hooks timeout
    hookTimeout: 10000,
  },
  
  resolve: {
    alias: {
      "@": resolve(__dirname, "./convex"),
    },
  },
});
