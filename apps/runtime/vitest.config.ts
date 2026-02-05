import { defineConfig } from "vitest/config";

/**
 * Vitest config for runtime unit tests.
 * Note: A Vite CJS deprecation warning may appear; tests still pass. See README "Testing" for ESM follow-up.
 */
export default defineConfig({
  test: {
    glob: ["src/**/*.test.ts"],
    environment: "node",
  },
});
