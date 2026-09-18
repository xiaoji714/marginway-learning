import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    testTimeout: 120000,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    isolate: true,
    sequence: { hooks: "stack" },
    include: ["**/tests/**/*.spec.ts", "scripts/test/**/*.spec.ts"],
    exclude: ["**/node_modules/**", "app/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json"],
      include: ["packages/*/*/src/**/*.ts"],
      thresholds: {
        perFile: true,
        autoUpdate: false,
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
