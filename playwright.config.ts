import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  retries: 0,
  outputDir: ".local/browser-results",
  snapshotPathTemplate: "{testDir}/snapshots/{testFilePath}/{arg}{ext}",
  reporter: [
    ["list"],
    ["html", { outputFolder: ".local/browser-report", open: "never" }],
  ],
  expect: {
    timeout: 15000,
    toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.001 },
  },
});
