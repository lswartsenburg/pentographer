import { test as setup, expect } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, "../.auth/user.json");

setup("authenticate", async ({ page }) => {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;

  if (!email || !password) {
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
