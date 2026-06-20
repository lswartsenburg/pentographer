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
  // In CI the app is pre-built; webServer starts it automatically.
  // Locally, run `pnpm dev` before `pnpm test:e2e`.
  ...(process.env.CI
    ? {
        webServer: {
          command: "pnpm start",
          url: "http://localhost:3000",
          reuseExistingServer: false,
          timeout: 60_000,
        },
      }
    : {}),
});
