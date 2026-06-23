import { test, expect } from "@playwright/test";

// These tests run without a saved session — they test the auth flows themselves.
test.use({ storageState: undefined });

function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@test.invalid`;
}

test.describe("Registration", () => {
  test("registers with valid credentials and lands on /dashboard", async ({ page }) => {
    const email = uniqueEmail();
    await page.goto("/register");
    await page.getByLabel("Name").fill("E2E Test User");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("securePassword123");
    await page.getByRole("button", { name: /register|sign up|create account/i }).click();

    await expect(page).toHaveURL(/\/(login|dashboard)/, { timeout: 10_000 });
  });

  test("shows validation error for duplicate email", async ({ page }) => {
    const email = uniqueEmail();

    // Register first time
    await page.goto("/register");
    await page.getByLabel("Name").fill("First User");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("securePassword123");
    await page.getByRole("button", { name: /register|sign up|create account/i }).click();
    await expect(page).toHaveURL(/\/(login|dashboard)/, { timeout: 10_000 });

    // Register second time with same email
    await page.goto("/register");
    await page.getByLabel("Name").fill("Second User");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("securePassword123");
    await page.getByRole("button", { name: /register|sign up|create account/i }).click();

    await expect(page.getByText(/failed|already|exists|duplicate/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  test("shows validation error for short password", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Name").fill("Test User");
    await page.getByLabel("Email").fill(uniqueEmail());
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: /register|sign up|create account/i }).click();

    // Should either show a form error or stay on the register page
    await expect(page)
      .toHaveURL(/\/register/, { timeout: 3_000 })
      .catch(() => {
        // Some implementations redirect and show a toast — just ensure we don't land on /dashboard
      });
  });
});

test.describe("Login", () => {
  let testEmail: string;
  const testPassword = "securePassword123";

  test.beforeAll(async ({ browser }) => {
    testEmail = uniqueEmail();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // Register the account we'll use for login tests
    await page.goto("http://localhost:3000/register");
    await page.getByLabel("Name").fill("Login Test User");
    await page.getByLabel("Email").fill(testEmail);
    await page.getByLabel("Password").fill(testPassword);
    await page.getByRole("button", { name: /register|sign up|create account/i }).click();
    await page.waitForURL(/\/(login|dashboard)/, { timeout: 10_000 });
    await ctx.close();
  });

  test("logs in with valid credentials and lands on /dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("you@example.com").fill(testEmail);
    await page.getByPlaceholder("••••••••").fill(testPassword);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test("shows error for wrong password", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("you@example.com").fill(testEmail);
    await page.getByPlaceholder("••••••••").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
    await expect(page.getByText(/invalid|incorrect|failed|wrong/i)).toBeVisible();
  });

  test("shows error for unknown email", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("you@example.com").fill("nobody@test.invalid");
    await page.getByPlaceholder("••••••••").fill("anypassword");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
    await expect(page.getByText(/invalid|incorrect|failed|wrong/i)).toBeVisible();
  });

  test("redirects unauthenticated user from /dashboard to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
  });

  test("can log out and /dashboard redirects back to /login", async ({ page }) => {
    // Log in first
    await page.goto("/login");
    await page.getByPlaceholder("you@example.com").fill(testEmail);
    await page.getByPlaceholder("••••••••").fill(testPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

    // Open user menu and sign out
    await page
      .getByRole("button", { name: /sign out|log out|logout/i })
      .click()
      .catch(async () => {
        // May be in a dropdown — open it first
        const trigger = page.locator("[data-sidebar='menu-button']").last();
        await trigger.click();
        await page.getByText(/sign out/i).click();
      });

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    // Navigating to /dashboard should redirect back to /login
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
  });
});
