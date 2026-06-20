import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Playbook draft/publish workflow — full E2E coverage.
 *
 * beforeAll sets up a fresh playbook via API (2 categories, 3 items) and
 * publishes the initial version. Tests run serially and share that playbook.
 */

async function setupPlaybook(request: APIRequestContext): Promise<{ playbookId: string }> {
  const pbRes = await request.post("/api/playbooks", {
    data: { name: `E2E Playbook ${Date.now()}`, description: "Created by E2E tests" },
  });
  expect(pbRes.status()).toBe(201);
  const pb = await pbRes.json();
  const playbookId: string = pb.id;
  const versionId: string = pb.latestVersion.id;

  // Category A
  const catARes = await request.post(
    `/api/playbooks/${playbookId}/versions/${versionId}/categories`,
    { data: { name: "Category A", displayOrder: 0 } }
  );
  expect(catARes.status()).toBe(201);
  const catA = await catARes.json();

  // Category B
  const catBRes = await request.post(
    `/api/playbooks/${playbookId}/versions/${versionId}/categories`,
    { data: { name: "Category B", displayOrder: 1 } }
  );
  expect(catBRes.status()).toBe(201);
  const catB = await catBRes.json();

  // Items in Category A: Alpha (high) and Beta (medium)
  for (const [name, risk, order] of [
    ["Item Alpha", "high", 0],
    ["Item Beta", "medium", 1],
  ] as const) {
    const r = await request.post(
      `/api/playbooks/${playbookId}/versions/${versionId}/categories/${catA.id}/items`,
      { data: { name, defaultRisk: risk, displayOrder: order } }
    );
    expect(r.status()).toBe(201);
  }

  // Item in Category B: Gamma (low)
  await request.post(
    `/api/playbooks/${playbookId}/versions/${versionId}/categories/${catB.id}/items`,
    { data: { name: "Item Gamma", defaultRisk: "low", displayOrder: 0 } }
  );

  // Publish the initial version
  const publishRes = await request.fetch(`/api/playbooks/${playbookId}/versions/${versionId}`, {
    method: "PATCH",
    data: { status: "published" },
  });
  expect(publishRes.status()).toBe(200);

  return { playbookId };
}

/** True when the editor is in an editable draft state (Save + Discard buttons visible). */
async function expectDraftMode(page: Page) {
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Discard draft" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create draft" })).not.toBeVisible();
}

/** True when viewing the published version (Create draft button, no edit controls). */
async function expectPublishedMode(page: Page) {
  await expect(page.getByRole("button", { name: "Create draft" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Publish" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Discard draft" })).not.toBeVisible();
}

test.describe.serial("Playbook draft workflow", () => {
  let playbookId: string;

  test.beforeAll(async ({ request }) => {
    ({ playbookId } = await setupPlaybook(request));
  });

  // ── 1. Published view ─────────────────────────────────────────────────────

  test("published view: correct header state, no edit controls", async ({ page }) => {
    await page.goto(`/playbooks/${playbookId}`);

    await expectPublishedMode(page);

    // All seeded content visible in sidebar
    await expect(page.getByText("Category A")).toBeVisible();
    await expect(page.getByText("Category B")).toBeVisible();
    await expect(page.getByText("Item Alpha")).toBeVisible();
    await expect(page.getByText("Item Beta")).toBeVisible();
    await expect(page.getByText("Item Gamma")).toBeVisible();
  });

  test("published view: no diff indicators present", async ({ page }) => {
    await page.goto(`/playbooks/${playbookId}`);

    await expect(page.locator(".bg-amber-400").first()).not.toBeVisible();
    await expect(page.locator(".bg-emerald-500").first()).not.toBeVisible();
    await expect(page.locator(".bg-red-400").first()).not.toBeVisible();
    await expect(page.getByText(/\d+ changes?/)).not.toBeVisible();
  });

  // ── 2. Create draft ───────────────────────────────────────────────────────

  test("create draft: transitions to editable draft state", async ({ page }) => {
    await page.goto(`/playbooks/${playbookId}`);
    await page.getByRole("button", { name: "Create draft" }).click();

    await expect(page.getByText("Draft created.")).toBeVisible({ timeout: 10_000 });

    await expectDraftMode(page);

    // "No changes" badge — draft is identical to published
    await expect(page.getByText("No changes")).toBeVisible();

    // Draft badge visible in header (amber styling)
    await expect(page.locator(".bg-amber-50", { hasText: /^Draft/ })).toBeVisible();

    // "+ Add item" links visible in sidebar (editor is enabled)
    await expect(page.getByText("Add item").first()).toBeVisible();
  });

  // ── 3. Edit item → amber indicators ──────────────────────────────────────

  test("modifying an item shows amber indicator and diff panel", async ({ page }) => {
    await page.goto(`/playbooks/${playbookId}`);

    // Click Item Alpha (currently High risk)
    await page.getByText("Item Alpha").click();

    // Change risk from High to Low
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Low" }).click();

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Item saved.")).toBeVisible({ timeout: 8_000 });

    // Header: "N changes" badge (replaces "No changes")
    await expect(page.getByText("No changes")).not.toBeVisible();
    await expect(page.getByText(/\d+ changes?/)).toBeVisible();

    // Sidebar: amber dot inside the Item Alpha row
    const itemRow = page.locator("button", { hasText: "Item Alpha" });
    await expect(itemRow.locator(".bg-amber-400")).toBeVisible();

    // Sidebar: Category A also gets an amber dot (contains a modified item)
    const catRow = page.locator("button", { hasText: "Category A" });
    await expect(catRow.locator(".bg-amber-400")).toBeVisible();

    // Detail panel: "Changes from published" section
    await expect(page.getByText("Changes from published")).toBeVisible();

    // Old value (red strikethrough) and new value (green)
    await expect(page.locator(".line-through", { hasText: "high" })).toBeVisible();
    await expect(page.locator(".text-emerald-700", { hasText: "low" })).toBeVisible();
  });

  // ── 4. Add item → green indicator ────────────────────────────────────────

  test("adding a new item shows green dot and increments change count", async ({ page }) => {
    await page.goto(`/playbooks/${playbookId}`);

    // Capture current change count
    const badge = page.getByText(/\d+ changes?/);
    const beforeText = await badge.textContent();
    const beforeCount = parseInt(beforeText ?? "0");

    // Click "+ Add item" under Category B (second "Add item" link)
    await page.getByText("Add item").nth(1).click();
    await page.keyboard.type("New E2E Item");
    await page.keyboard.press("Enter");

    // New item appears in sidebar button
    const newItemRow = page.locator("button", { hasText: "New E2E Item" });
    await expect(newItemRow).toBeVisible({ timeout: 5_000 });
    await expect(newItemRow.locator(".bg-emerald-500")).toBeVisible();

    // Category B row also gets a dot (it now has a change)
    const catRow = page.locator("button", { hasText: "Category B" });
    await expect(catRow.locator(".bg-amber-400")).toBeVisible();

    // Change count increased
    const afterText = await badge.textContent();
    const afterCount = parseInt(afterText ?? "0");
    expect(afterCount).toBeGreaterThan(beforeCount);
  });

  // ── 5. Delete item → red strikethrough ───────────────────────────────────

  test("deleting an item shows red strikethrough in sidebar", async ({ page }) => {
    await page.goto(`/playbooks/${playbookId}`);

    // Open Item Beta
    await page.getByText("Item Beta").click();

    // Click the trash icon in the detail panel
    await page.getByTitle("Delete item").click();
    await expect(page.getByText("Item deleted.")).toBeVisible({ timeout: 5_000 });

    // Item Beta is gone from the active item list
    await expect(page.locator("button", { hasText: "Item Beta" })).not.toBeVisible();

    // Appears as a struck-through "removed" entry
    const removedEntry = page.locator(".line-through", { hasText: "Item Beta" });
    await expect(removedEntry).toBeVisible();

    // Red dot accompanies the struck-through entry
    await expect(removedEntry.locator("..").locator(".bg-red-400")).toBeVisible();
  });

  // ── 6. Toggle Draft ↔ Published ───────────────────────────────────────────

  test("switching to published view hides diff indicators and edit controls", async ({ page }) => {
    await page.goto(`/playbooks/${playbookId}`);

    // Confirm we're on draft with changes visible
    await expect(page.getByText(/\d+ changes?/)).toBeVisible();
    await expectDraftMode(page);

    // Click the published version button in the Draft/Published toggle (e.g. "v1.0")
    await page.locator("button", { hasText: /^v\d/ }).click();

    // No diff indicators
    await expect(page.locator(".bg-amber-400").first()).not.toBeVisible();
    await expect(page.locator(".bg-emerald-500").first()).not.toBeVisible();
    await expect(page.locator(".bg-red-400").first()).not.toBeVisible();
    await expect(page.getByText(/\d+ changes?/)).not.toBeVisible();

    // No edit controls — read-only view
    await expect(page.getByRole("button", { name: "Save" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Publish" })).not.toBeVisible();

    // Switch back to Draft via toggle — indicators return
    await page.locator("button", { hasText: /^Draft$/ }).click();
    await expect(page.getByText(/\d+ changes?/)).toBeVisible();
    await expectDraftMode(page);
  });

  // ── 7. Discard draft ─────────────────────────────────────────────────────

  test("discarding draft returns to published view", async ({ page }) => {
    await page.goto(`/playbooks/${playbookId}`);

    await page.getByRole("button", { name: "Discard draft" }).click();
    await expect(page.getByText("Draft discarded.")).toBeVisible({ timeout: 8_000 });

    await expectPublishedMode(page);

    // No diff indicators remain
    await expect(page.locator(".bg-amber-400").first()).not.toBeVisible();
    await expect(page.getByText(/\d+ changes?/)).not.toBeVisible();
  });

  // ── 8. Publish draft ──────────────────────────────────────────────────────

  test("publishing a draft creates a new published version", async ({ page }) => {
    await page.goto(`/playbooks/${playbookId}`);

    // Create a fresh draft
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByText("Draft created.")).toBeVisible({ timeout: 10_000 });
    await expectDraftMode(page);

    // Make a small change so there is something to publish
    await page.getByText("Item Alpha").click();
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Medium" }).click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Item saved.")).toBeVisible({ timeout: 8_000 });

    // Publish
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText("Published.")).toBeVisible({ timeout: 8_000 });

    // Now on the new published version
    await expectPublishedMode(page);

    // No diff indicators on the newly published version
    await expect(page.locator(".bg-amber-400").first()).not.toBeVisible();
    await expect(page.getByText(/\d+ changes?/)).not.toBeVisible();
  });
});
