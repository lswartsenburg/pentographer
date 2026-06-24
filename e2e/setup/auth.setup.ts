import { test as setup, expect } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, "../.auth/user.json");

setup("authenticate", async ({ page, request }) => {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;

  if (email && password) {
    await page.goto("/login");
    await page.getByPlaceholder("you@example.com").fill(email);
    await page.getByPlaceholder("••••••••").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
  } else {
    // Register a fresh test user so the session always has a personal org.
    const ts = Date.now();
    const testEmail = `e2e-setup-${ts}@test.invalid`;
    const testPassword = "securePassword123";

    const res = await request.post("/api/auth/register", {
      data: { name: "E2E Setup User", email: testEmail, password: testPassword },
    });
    if (!res.ok()) throw new Error(`Setup registration failed: ${await res.text()}`);

    await page.goto("/login");
    await page.getByPlaceholder("you@example.com").fill(testEmail);
    await page.getByPlaceholder("••••••••").fill(testPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
  }

  await page.context().storageState({ path: authFile });
});
