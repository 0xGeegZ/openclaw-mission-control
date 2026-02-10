import { defineConfig } from "vitest/config";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Vitest config for web app unit tests (ESM for Vitest 4). */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "jsdom",
    globals: true,
    
    // Coverage configuration for frontend critical paths
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      all: true,
      include: [
        "src/**/*.ts",
        "src/**/*.tsx",
      ],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/lib/test-utils/**",
        "src/**/*.d.ts",
      ],
      // Frontend critical paths: 50%+ coverage for essential components
      lines: 50,
      functions: 50,
      branches: 40,
      statements: 50,
      // Thresholds that fail the build if coverage is below target
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 40,
        statements: 50,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
