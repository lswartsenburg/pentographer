import { test, expect, type Page } from "@playwright/test";

// The main actor uses the saved session from auth.setup.
// A second actor is registered programmatically and uses a fresh context.

const BASE = "http://localhost:3000";

function uniqueEmail() {
  return `e2e-org-${Date.now()}-${Math.random().toString(36).slice(2)}@test.invalid`;
}

async function registerUser(
  page: Page,
  name: string,
  email: string,
  password: string
): Promise<void> {
  const res = await page.request.post(`${BASE}/api/auth/register`, {
    data: { name, email, password },
  });
  if (!res.ok()) {
    throw new Error(`Registration failed: ${await res.text()}`);
  }
}

async function loginUser(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
}

// ── Happy paths ───────────────────────────────────────────────────────────────

test.describe("Organization — happy paths", () => {
  test("registration creates a personal org and the user is an owner", async ({ browser }) => {
    const email = uniqueEmail();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await registerUser(page, "Org Happy User", email, "securePassword123");
    await loginUser(page, email, "securePassword123");

    const teamRes = await page.request.get(`${BASE}/api/settings/team`);
    expect(teamRes.ok()).toBe(true);
    const members = await teamRes.json();
    const me = members.find((m: { email: string; role: string }) => m.email === email);
    expect(me).toBeDefined();
    expect(me.role).toBe("owner");

    await ctx.close();
  });

  test("owner can add a member and they appear in the team list", async ({ browser }) => {
    const ownerEmail = uniqueEmail();
    const memberEmail = uniqueEmail();
    const password = "securePassword123";

    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();

    await registerUser(ownerPage, "Org Owner", ownerEmail, password);
    await registerUser(ownerPage, "Org Member", memberEmail, password);

    await loginUser(ownerPage, ownerEmail, password);

    const addRes = await ownerPage.request.post(`${BASE}/api/settings/team`, {
      data: { email: memberEmail, role: "member" },
    });
    expect(addRes.ok()).toBe(true);

    const listRes = await ownerPage.request.get(`${BASE}/api/settings/team`);
    const members = await listRes.json();
    const added = members.find((m: { email: string }) => m.email === memberEmail);
    expect(added).toBeDefined();
    expect(added.role).toBe("member");

    await ownerCtx.close();
  });

  test("member can see org resources created by the owner", async ({ browser }) => {
    const ownerEmail = uniqueEmail();
    const memberEmail = uniqueEmail();
    const password = "securePassword123";

    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();

    await registerUser(ownerPage, "Resource Owner", ownerEmail, password);
    await registerUser(ownerPage, "Resource Member", memberEmail, password);
    await loginUser(ownerPage, ownerEmail, password);

    // Add the member
    await ownerPage.request.post(`${BASE}/api/settings/team`, {
      data: { email: memberEmail, role: "member" },
    });

    // Owner creates a customer
    const custRes = await ownerPage.request.post(`${BASE}/api/customers`, {
      data: { name: "Shared Customer" },
    });
    expect(custRes.ok()).toBe(true);

    // Member logs in and should see the customer
    const memberCtx = await browser.newContext();
    const memberPage = await memberCtx.newPage();
    await loginUser(memberPage, memberEmail, password);

    const listRes = await memberPage.request.get(`${BASE}/api/customers`);
    expect(listRes.ok()).toBe(true);
    const customers = await listRes.json();
    expect(customers.some((c: { name: string }) => c.name === "Shared Customer")).toBe(true);

    await ownerCtx.close();
    await memberCtx.close();
  });

  test("owner can remove a member", async ({ browser }) => {
    const ownerEmail = uniqueEmail();
    const memberEmail = uniqueEmail();
    const password = "securePassword123";

    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();

    await registerUser(ownerPage, "Remove Owner", ownerEmail, password);
    await registerUser(ownerPage, "Remove Member", memberEmail, password);
    await loginUser(ownerPage, ownerEmail, password);

    // Add
    const addRes = await ownerPage.request.post(`${BASE}/api/settings/team`, {
      data: { email: memberEmail, role: "member" },
    });
    const added = await addRes.json();

    // Remove
    const delRes = await ownerPage.request.delete(`${BASE}/api/settings/team/${added.id}`);
    expect(delRes.ok()).toBe(true);

    // Member no longer in list
    const listRes = await ownerPage.request.get(`${BASE}/api/settings/team`);
    const members = await listRes.json();
    expect(members.some((m: { email: string }) => m.email === memberEmail)).toBe(false);

    await ownerCtx.close();
  });

  test("owner can change a member's role", async ({ browser }) => {
    const ownerEmail = uniqueEmail();
    const memberEmail = uniqueEmail();
    const password = "securePassword123";

    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();

    await registerUser(ownerPage, "Role Owner", ownerEmail, password);
    await registerUser(ownerPage, "Role Member", memberEmail, password);
    await loginUser(ownerPage, ownerEmail, password);

    const addRes = await ownerPage.request.post(`${BASE}/api/settings/team`, {
      data: { email: memberEmail, role: "member" },
    });
    const added = await addRes.json();

    const patchRes = await ownerPage.request.patch(`${BASE}/api/settings/team/${added.id}`, {
      data: { role: "viewer" },
    });
    expect(patchRes.ok()).toBe(true);
    const updated = await patchRes.json();
    expect(updated.role).toBe("viewer");

    await ownerCtx.close();
  });
});

// ── Unhappy paths ─────────────────────────────────────────────────────────────

test.describe("Organization — unhappy paths", () => {
  test("viewer cannot create a customer (403)", async ({ browser }) => {
    const ownerEmail = uniqueEmail();
    const viewerEmail = uniqueEmail();
    const password = "securePassword123";

    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();

    await registerUser(ownerPage, "Viewer Owner", ownerEmail, password);
    await registerUser(ownerPage, "Viewer User", viewerEmail, password);
    await loginUser(ownerPage, ownerEmail, password);

    const addRes = await ownerPage.request.post(`${BASE}/api/settings/team`, {
      data: { email: viewerEmail, role: "viewer" },
    });
    expect(addRes.ok()).toBe(true);

    const viewerCtx = await browser.newContext();
    const viewerPage = await viewerCtx.newPage();
    await loginUser(viewerPage, viewerEmail, password);

    const res = await viewerPage.request.post(`${BASE}/api/customers`, {
      data: { name: "Should fail" },
    });
    expect(res.status()).toBe(403);

    await ownerCtx.close();
    await viewerCtx.close();
  });

  test("member cannot manage other members (403)", async ({ browser }) => {
    const ownerEmail = uniqueEmail();
    const memberEmail = uniqueEmail();
    const targetEmail = uniqueEmail();
    const password = "securePassword123";

    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();

    await registerUser(ownerPage, "Mgmt Owner", ownerEmail, password);
    await registerUser(ownerPage, "Mgmt Member", memberEmail, password);
    await registerUser(ownerPage, "Mgmt Target", targetEmail, password);
    await loginUser(ownerPage, ownerEmail, password);

    await ownerPage.request.post(`${BASE}/api/settings/team`, {
      data: { email: memberEmail, role: "member" },
    });

    const memberCtx = await browser.newContext();
    const memberPage = await memberCtx.newPage();
    await loginUser(memberPage, memberEmail, password);

    const res = await memberPage.request.post(`${BASE}/api/settings/team`, {
      data: { email: targetEmail, role: "member" },
    });
    expect(res.status()).toBe(403);

    await ownerCtx.close();
    await memberCtx.close();
  });

  test("org B cannot access org A's resources (404)", async ({ browser }) => {
    const orgAEmail = uniqueEmail();
    const orgBEmail = uniqueEmail();
    const password = "securePassword123";

    const orgACtx = await browser.newContext();
    const orgAPage = await orgACtx.newPage();
    await registerUser(orgAPage, "Org A User", orgAEmail, password);
    await loginUser(orgAPage, orgAEmail, password);

    const custRes = await orgAPage.request.post(`${BASE}/api/customers`, {
      data: { name: "Org A Private Customer" },
    });
    const orgACust = await custRes.json();

    const orgBCtx = await browser.newContext();
    const orgBPage = await orgBCtx.newPage();
    await registerUser(orgBPage, "Org B User", orgBEmail, password);
    await loginUser(orgBPage, orgBEmail, password);

    // Org B tries to access Org A's customer directly
    const res = await orgBPage.request.get(`${BASE}/api/customers/${orgACust.id}`);
    expect(res.status()).toBe(404);

    await orgACtx.close();
    await orgBCtx.close();
  });

  test("cannot add a non-existent email as member (404)", async ({ browser }) => {
    const ownerEmail = uniqueEmail();
    const password = "securePassword123";

    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    await registerUser(ownerPage, "Add Owner", ownerEmail, password);
    await loginUser(ownerPage, ownerEmail, password);

    const res = await ownerPage.request.post(`${BASE}/api/settings/team`, {
      data: { email: "nobody@test.invalid", role: "member" },
    });
    expect(res.status()).toBe(404);

    await ownerCtx.close();
  });

  test("cannot remove the sole owner (400)", async ({ browser }) => {
    const ownerEmail = uniqueEmail();
    const password = "securePassword123";

    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    await registerUser(ownerPage, "Sole Owner", ownerEmail, password);
    await loginUser(ownerPage, ownerEmail, password);

    // Get my own membership ID
    const listRes = await ownerPage.request.get(`${BASE}/api/settings/team`);
    const members = await listRes.json();
    const me = members.find((m: { email: string }) => m.email === ownerEmail);
    expect(me).toBeDefined();

    const res = await ownerPage.request.delete(`${BASE}/api/settings/team/${me.id}`);
    expect(res.status()).toBe(400);

    await ownerCtx.close();
  });
});
