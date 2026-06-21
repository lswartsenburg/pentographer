import { test as setup, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const authFile = path.join(__dirname, "../.auth/user.json");

setup("authenticate", async ({ page }) => {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;

  // If credentials are not provided but a saved session already exists, reuse it.
  // This lets developers run tests locally without re-entering credentials every time.
  if (!email || !password) {
    if (fs.existsSync(authFile)) {
      console.log("TEST_EMAIL/TEST_PASSWORD not set — reusing existing saved session.");
      return;
    }
    throw new Error(
      "TEST_EMAIL and TEST_PASSWORD must be set to run e2e tests.\n" +
        "Add them to .env.local or export them before running pnpm test:e2e"
    );
  }

  await page.goto("/login");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Wait for redirect away from /login
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

  await page.context().storageState({ path: authFile });
});
