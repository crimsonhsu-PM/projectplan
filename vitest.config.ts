import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": new URL("./", import.meta.url).pathname },
  },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["lib/planner-domain.ts", "lib/project-data-store.ts"],
      thresholds: {
        statements: 80,
        lines: 80,
        branches: 70,
      },
    },
  },
});
