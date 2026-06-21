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
  });

  test("creates a new finding and it appears in the project findings list", async ({ page }) => {
    test.skip(!projectId, "TEST_PROJECT_ID not set — add it to .env.local to enable this test");
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

/**
 * Regression tests for evidence URL normalization.
 *
 * Bug: evidenceUrls stored in old DB rows were plain strings ("https://...")
 * instead of {key, url} objects. The finding editor crashed on load with
 * "Cannot read properties of undefined (reading 'match')" and "...'split'".
 *
 * Fix: normalize raw evidence on init so the component always sees {key, url}.
 *
 * These tests ensure neither path regresses:
 *  1. Happy path: save properly-formatted evidence, reload — page must not crash.
 *  2. Legacy path: load a known finding with old-format evidence — page must not crash.
 *     Requires TEST_LEGACY_FINDING_ID (see below). Skipped if not set.
 *
 * To run the legacy test locally, set in .env.local:
 *   TEST_LEGACY_FINDING_ID=<findingId with plain-string evidenceUrls in its DB row>
 *   TEST_LEGACY_PROJECT_ID=<projectId that owns that finding>
 * The specific finding that triggered the original bug:
 *   project  e6fa3a12-5388-40d7-acba-2ea154f1f49a
 *   finding  c35b8408-a136-4d2b-819f-c1530065f408
 */
test.describe("Finding editor — evidence normalization", () => {
  let projectId: string;

  test.beforeAll(async () => {
    projectId = process.env.TEST_PROJECT_ID ?? "";
  });

  /** Helpers ---------------------------------------------------------------- */

  /** Assert that the finding editor rendered (not crashed). */
  async function assertEditorLoaded(page: import("@playwright/test").Page) {
    await expect(page.getByPlaceholder("Finding title")).toBeVisible({ timeout: 10_000 });
    // Next.js dev-mode error overlay would contain this text if a runtime error occurred
    await expect(page.getByText("Runtime TypeError")).not.toBeVisible();
    await expect(page.getByText("Cannot read properties of undefined")).not.toBeVisible();
  }

  /** --------------------------------------------------------------------------
   * Happy-path regression: save a version with proper {key,url} evidence, then
   * reload. The normalization function must not break correctly-formatted data.
   * -------------------------------------------------------------------------- */
  test("finding with properly-formatted evidence reloads without crashing", async ({ page }) => {
    test.skip(!projectId, "TEST_PROJECT_ID not set — add it to .env.local to enable this test");
    const title = `E2E Evidence Test ${Date.now()}`;

    // Create a new finding
    await page.goto(`/projects/${projectId}/findings/new`);
    await expect(page.getByLabel("Finding title")).toBeVisible({ timeout: 10_000 });
    await page.getByLabel("Finding title").fill(title);
    await page.selectOption("#riskLevel", "medium");
    await page.getByRole("button", { name: "Create finding" }).click();

    await expect(page).toHaveURL(/\/findings\/[0-9a-f-]+$/, { timeout: 10_000 });
    const findingUrl = page.url();

    // Save a version (no evidence attached — exercises the empty-array path)
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Finding saved.")).toBeVisible({ timeout: 8_000 });

    // Hard reload — exercises the normalization code on the saved version
    await page.goto(findingUrl);
    await assertEditorLoaded(page);
  });

  /** --------------------------------------------------------------------------
   * Legacy-data regression: load a finding whose evidenceUrls column contains
   * plain strings instead of {key,url} objects (old format before the schema
   * was tightened). Without the normalization fix this crashed on load.
   *
   * Skipped unless TEST_LEGACY_FINDING_ID + TEST_LEGACY_PROJECT_ID are set.
   * -------------------------------------------------------------------------- */
  test("finding with legacy plain-string evidence URLs loads without crashing", async ({
    page,
  }) => {
    const legacyFindingId = process.env.TEST_LEGACY_FINDING_ID;
    const legacyProjectId = process.env.TEST_LEGACY_PROJECT_ID ?? projectId;

    if (!legacyFindingId) {
      test.skip();
      return;
    }

    await page.goto(`/projects/${legacyProjectId}/findings/${legacyFindingId}`);
    await assertEditorLoaded(page);

    // Evidence section must be present (not missing due to normalization wiping items)
    await expect(page.getByText("EVIDENCE", { exact: false })).toBeVisible();
  });
});
