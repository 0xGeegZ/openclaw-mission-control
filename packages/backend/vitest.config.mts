import { defineConfig } from "vitest/config";

/** Vitest config for backend unit tests (ESM for Vitest 4). */
export default defineConfig({
  test: {
    include: ["convex/**/*.test.ts"],
    environment: "node",
  },
});
