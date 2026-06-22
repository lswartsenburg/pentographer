import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Playbook end-to-end tests.
 *
 * The first describe block (serial) covers the full draft/publish workflow plus
 * additional editing operations (overview, categories, items, version history).
 *
 * beforeAll sets up a fresh playbook via API (2 categories, 3 items) and
 * publishes the initial version v1. Tests run serially and share that playbook.
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

/** True when the editor is in an editable draft state (Discard + Publish buttons visible). */
async function expectDraftMode(page: Page) {
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

/** Create a draft via the UI if not already in draft mode. */
async function ensureDraftMode(page: Page) {
  const createDraftBtn = page.getByRole("button", { name: "Create draft" });
  if (await createDraftBtn.isVisible()) {
    await createDraftBtn.click();
    await expect(page.getByText("Draft created.")).toBeVisible({ timeout: 10_000 });
  }
  await expectDraftMode(page);
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

  // ── 9. Version history navigation ─────────────────────────────────────────

  test("version history: can navigate to an older published version via dropdown", async ({
    page,
  }) => {
    await page.goto(`/playbooks/${playbookId}`);

    // After test 8 there are 2 published versions — the picker renders as a <select>
    // (the version picker shows a select when publishedVersions.length > 1)
    const versionSelect = page.locator("header").locator("select");
    await expect(versionSelect).toBeVisible({ timeout: 8_000 });

    const optionCount = await versionSelect.locator("option").count();
    expect(optionCount).toBeGreaterThanOrEqual(2);

    // Select the oldest version (last option = lowest version number)
    await versionSelect.selectOption({ index: optionCount - 1 });
    await expect(page).toHaveURL(/\?version=/);

    // In read-only / published state — no edit controls
    await expect(page.getByRole("button", { name: "Save" })).not.toBeVisible();

    // All original items are present in v1
    await expect(page.getByText("Item Alpha")).toBeVisible();
    await expect(page.getByText("Item Beta")).toBeVisible();
    await expect(page.getByText("Item Gamma")).toBeVisible();

    // In v1, Item Alpha has High risk — sidebar badge shows "H"
    const alphaRow = page.locator("button", { hasText: "Item Alpha" });
    await expect(alphaRow.locator("span", { hasText: /^H$/ })).toBeVisible();
  });

  // ── 10. Playbook overview edit ────────────────────────────────────────────

  test("editing playbook name and description updates the overview", async ({ page }) => {
    await page.goto(`/playbooks/${playbookId}`);
    await ensureDraftMode(page);

    // Open the overview detail panel.
    await page.getByRole("button", { name: "Overview" }).click();
    const overviewPanel = page.locator(".max-w-xl");
    await expect(overviewPanel).toBeVisible({ timeout: 5_000 });

    const nameInput = overviewPanel.locator("input");
    await nameInput.fill("Updated Playbook Name");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Playbook saved.")).toBeVisible({ timeout: 8_000 });

    // Input persists the saved name after the toast
    await expect(nameInput).toHaveValue("Updated Playbook Name");

    // Edit instructions text
    await page
      .getByPlaceholder("Describe the scope, methodology, and any reviewer instructions")
      .fill("E2E test instructions");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Playbook saved.")).toBeVisible({ timeout: 8_000 });
  });

  // ── 11. Add category ─────────────────────────────────────────────────────

  test("adding a new category creates it in the sidebar", async ({ page }) => {
    await page.goto(`/playbooks/${playbookId}`);
    await ensureDraftMode(page);

    // Scroll to the bottom of the sidebar to find "+ Add category"
    const addCategoryLink = page.getByText("Add category");
    await addCategoryLink.scrollIntoViewIfNeeded();
    await addCategoryLink.click();

    // Type the new category name and confirm
    await page.keyboard.type("New E2E Category");
    await page.keyboard.press("Enter");

    // The new category should appear in the sidebar
    await expect(page.getByText("New E2E Category")).toBeVisible({ timeout: 5_000 });
  });

  // ── 12. Item description and remediation ──────────────────────────────────

  test("editing item description and remediation and saving reflects in detail panel", async ({
    page,
  }) => {
    await page.goto(`/playbooks/${playbookId}`);
    await ensureDraftMode(page);

    await page.getByText("Item Gamma").click();

    const descriptionField = page.getByPlaceholder("Testing guidance for this issue…");
    await descriptionField.fill("E2E description text");

    const remediationField = page.getByPlaceholder("How to fix this issue…");
    await remediationField.fill("E2E remediation text");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Item saved.")).toBeVisible({ timeout: 8_000 });

    // After save, the detail panel should still show the saved values
    await expect(descriptionField).toHaveValue("E2E description text");
    await expect(remediationField).toHaveValue("E2E remediation text");
  });

  // ── 13. Toggle item active / inactive ────────────────────────────────────

  test("toggling an item inactive is saved and shows the item as inactive", async ({ page }) => {
    await page.goto(`/playbooks/${playbookId}`);
    await ensureDraftMode(page);

    await page.getByText("Item Gamma").click();

    // "Active in this version" switch should initially be on
    const activeSwitch = page.getByRole("switch");
    await expect(activeSwitch).toBeChecked();

    // Toggle it off
    await activeSwitch.click();
    await expect(activeSwitch).not.toBeChecked();

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Item saved.")).toBeVisible({ timeout: 8_000 });

    // Toggle back on so subsequent tests are not affected
    await activeSwitch.click();
    await expect(activeSwitch).toBeChecked();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Item saved.")).toBeVisible({ timeout: 8_000 });
  });
});
