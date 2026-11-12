import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Playwright owns e2e/**. Vitest's default include matches `*.spec.ts`,
    // so without this the unit run tries to execute the browser specs.
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**", "e2e/**", "test-results/**", ".vercel/**"],
  },
});
