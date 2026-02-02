import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    glob: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
