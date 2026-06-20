import { test, expect } from "@playwright/test";

/**
 * Creates a finding end-to-end: navigates to an existing project, adds a new
 * finding with a title and risk level, saves it, and verifies the finding
 * appears in the project's findings list.
 *
 * Requires: TEST_PROJECT_ID env var pointing to a project owned by the test user.
 */

test.describe("Finding creation and save", () => {
  let projectId: string;

  test.beforeAll(async () => {
    projectId = process.env.TEST_PROJECT_ID ?? "";
    if (!projectId) {
      throw new Error(
        "TEST_PROJECT_ID must be set to run finding e2e tests.\n" +
          "Set it to an existing project ID owned by the TEST_EMAIL user."
      );
    }
  });

  test("creates a new finding and it appears in the project findings list", async ({ page }) => {
    const title = `E2E Test Finding ${Date.now()}`;

    // Navigate to the "new finding" form
    await page.goto(`/projects/${projectId}/findings/new`);
    await expect(page.getByLabel("Finding title")).toBeVisible();

    // Fill in the form
    await page.getByLabel("Finding title").fill(title);
    await page.selectOption("#riskLevel", "high");

    // Submit
    await page.getByRole("button", { name: "Create finding" }).click();

    // Should redirect to the finding editor
    await expect(page).toHaveURL(/\/findings\/[0-9a-f-]+$/, { timeout: 10_000 });
    await expect(page.getByPlaceholder("Finding title")).toHaveValue(title);

    // Fill in description and save a version
    const descriptionBox = page.getByPlaceholder(
      "Describe the vulnerability, its impact, and where it was found…"
    );
    await descriptionBox.fill("Test description written by the e2e suite.");
    await page.getByRole("button", { name: "Save" }).click();

    // Toast confirms the save
    await expect(page.getByText("Finding saved.")).toBeVisible({ timeout: 8_000 });

    // Navigate back to the project and confirm the finding appears in the list
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText(title)).toBeVisible({ timeout: 8_000 });
  });
});
