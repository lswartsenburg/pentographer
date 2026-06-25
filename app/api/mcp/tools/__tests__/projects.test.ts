import crypto from "crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  organization,
  userAccount,
  customer,
  project,
  playbook,
  playbookVersion,
  playbookCategory,
  playbookItem,
  finding,
  findingVersion,
} from "@/db/schema";
import { listProjectPlaybookItems } from "../projects";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TAG = crypto.randomBytes(4).toString("hex");

let orgId: string;
let userId: string;
let customerId: string;
let pbVersionId: string;
let itemAuthId: string; // Authentication category item
let itemInputId: string; // Input Validation category item
let itemCsrfId: string; // second item in same category

// IDs cleaned up in afterAll
const createdProjectIds: string[] = [];

beforeAll(async () => {
  const [org] = await db
    .insert(organization)
    .values({ name: `MCP Test Org ${TAG}` })
    .returning();
  orgId = org.id;

  const [user] = await db
    .insert(userAccount)
    .values({
      name: "MCP Test User",
      email: `mcp-test-${TAG}@example.com`,
      passwordHash: "unused",
      personalOrgId: orgId,
    })
    .returning();
  userId = user.id;

  const [cust] = await db
    .insert(customer)
    .values({ organizationId: orgId, userId, name: "Test Customer" })
    .returning();
  customerId = cust.id;

  // Build playbook: 1 playbook → 1 version → 2 categories → 3 items total
  const [pb] = await db
    .insert(playbook)
    .values({ organizationId: orgId, userId, name: `Test Playbook ${TAG}` })
    .returning();

  const [ver] = await db
    .insert(playbookVersion)
    .values({ playbookId: pb.id, version: "1.0", isActive: true, status: "published" })
    .returning();
  pbVersionId = ver.id;

  const [catAuth] = await db
    .insert(playbookCategory)
    .values({ playbookVersionId: ver.id, name: "Authentication", displayOrder: 0 })
    .returning();

  const [catInput] = await db
    .insert(playbookCategory)
    .values({ playbookVersionId: ver.id, name: "Input Validation", displayOrder: 1 })
    .returning();

  const [iAuth] = await db
    .insert(playbookItem)
    .values({ categoryId: catAuth.id, name: "Test password policy", defaultRisk: "medium" })
    .returning();
  itemAuthId = iAuth.id;

  const [iInput] = await db
    .insert(playbookItem)
    .values({ categoryId: catInput.id, name: "Test SQL injection", defaultRisk: "high" })
    .returning();
  itemInputId = iInput.id;

  const [iCsrf] = await db
    .insert(playbookItem)
    .values({ categoryId: catInput.id, name: "Test CSRF", defaultRisk: "medium" })
    .returning();
  itemCsrfId = iCsrf.id;
});

afterAll(async () => {
  for (const id of createdProjectIds) {
    await db.delete(finding).where(eq(finding.projectId, id));
    await db.delete(project).where(eq(project.id, id));
  }
  await db.delete(customer).where(eq(customer.id, customerId));
  await db.delete(playbookVersion).where(eq(playbookVersion.id, pbVersionId));
  await db.delete(userAccount).where(eq(userAccount.id, userId));
  await db.delete(organization).where(eq(organization.id, orgId));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeProject(withPlaybook = true): Promise<string> {
  const [p] = await db
    .insert(project)
    .values({
      organizationId: orgId,
      userId,
      customerId,
      name: `Test Project ${crypto.randomBytes(2).toString("hex")}`,
      status: "in_progress",
      playbookVersionId: withPlaybook ? pbVersionId : null,
    })
    .returning();
  createdProjectIds.push(p.id);
  return p.id;
}

async function linkFinding(
  projectId: string,
  playbookItemId: string,
  status: "confirmed" | "false_positive" | "draft" = "confirmed"
) {
  const [f] = await db
    .insert(finding)
    .values({
      projectId,
      playbookItemId,
      title: "Test finding",
      riskLevel: "medium",
      status,
      isAdhoc: false,
    })
    .returning();
  await db.insert(findingVersion).values({
    findingId: f.id,
    title: "Test finding",
    riskLevel: "medium",
    status,
    authorType: "ai",
  });
  return f;
}

function text(result: Awaited<ReturnType<typeof listProjectPlaybookItems>>): string {
  return result.content[0].text;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("listProjectPlaybookItems", () => {
  it("returns not-found for an unknown project ID", async () => {
    const result = await listProjectPlaybookItems(userId, crypto.randomUUID());
    expect(text(result)).toBe("Project not found.");
  });

  it("returns not-found when the project belongs to a different user", async () => {
    const projectId = await makeProject();
    const result = await listProjectPlaybookItems(
      "00000000-0000-0000-0000-000000000000",
      projectId
    );
    expect(text(result)).toBe("Project not found.");
  });

  it("reports no playbook when the project has none attached", async () => {
    const projectId = await makeProject(false);
    const result = await listProjectPlaybookItems(userId, projectId);
    expect(text(result)).toContain("no playbook attached");
  });

  it("shows all items as NOT TESTED when there are no findings", async () => {
    const projectId = await makeProject();
    const result = await listProjectPlaybookItems(userId, projectId);
    const out = text(result);

    expect(out).toContain("NOT TESTED");
    expect(out).not.toContain("✓");
    expect(out).toContain("Summary: 0 tested, 3 not yet tested");
  });

  it("marks an item tested when a finding is linked to it", async () => {
    const projectId = await makeProject();
    await linkFinding(projectId, itemAuthId, "confirmed");

    const result = await listProjectPlaybookItems(userId, projectId);
    const out = text(result);

    expect(out).toContain(`✓`);
    expect(out).toContain("[CONFIRMED]");
    expect(out).toContain("Summary: 1 tested, 2 not yet tested");
  });

  it("reflects the finding's actual status (not just confirmed)", async () => {
    const projectId = await makeProject();
    await linkFinding(projectId, itemInputId, "false_positive");

    const result = await listProjectPlaybookItems(userId, projectId);
    const out = text(result);

    expect(out).toContain("[FALSE_POSITIVE]");
    expect(out).toContain("Summary: 1 tested, 2 not yet tested");
  });

  it("shows 0 untested when all items have findings", async () => {
    const projectId = await makeProject();
    await linkFinding(projectId, itemAuthId);
    await linkFinding(projectId, itemInputId);
    await linkFinding(projectId, itemCsrfId);

    const result = await listProjectPlaybookItems(userId, projectId);
    expect(text(result)).toContain("Summary: 3 tested, 0 not yet tested");
  });

  it("groups items under their category headings", async () => {
    const projectId = await makeProject();
    const result = await listProjectPlaybookItems(userId, projectId);
    const out = text(result);

    expect(out).toContain("## Authentication");
    expect(out).toContain("## Input Validation");
    expect(out).toContain("Test password policy");
    expect(out).toContain("Test SQL injection");
    expect(out).toContain("Test CSRF");
  });
});
