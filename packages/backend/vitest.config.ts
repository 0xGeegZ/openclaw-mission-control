import { defineConfig } from "vitest/config";

/** Vitest config for backend unit tests (e.g. convex/lib helpers). */
export default defineConfig({
  test: {
    include: ["convex/**/*.test.ts"],
    environment: "node",
  },
});
