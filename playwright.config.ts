import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  fullyParallel: false,
  timeout: 30000,
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4325",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `"${process.execPath}" tests/server-fixture.mjs`,
    url: "http://127.0.0.1:4325/api/health",
    reuseExistingServer: false,
    env: { NODE_ENV: "test", DATA_FILE: ".test-data/reputation.sqlite" },
    timeout: 30000,
  },
});
