import { defineConfig } from "vitest/config";

// Unit tests for pure domain logic (money math, escrow state machine, item matching).
// Node environment — no DOM, no DB. Excludes node_modules and the Anchor workspace.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
