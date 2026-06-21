import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: "**/setup/auth.setup.ts",
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
  // In CI the app is pre-built and the standalone server is started directly.
  // Locally, Playwright reuses a running dev server or starts one automatically.
  webServer: process.env.CI
    ? {
        command: "node .next/standalone/server.js",
        url: "http://localhost:3000",
        reuseExistingServer: false,
        timeout: 60_000,
        env: { PORT: "3000", HOSTNAME: "0.0.0.0" },
      }
    : {
        command: "pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
