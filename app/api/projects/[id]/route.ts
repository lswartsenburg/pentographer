import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { project, auditLog, type TestAccount } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { requireOrgRole } from "@/lib/org-access";
import { encrypt, decrypt } from "@/lib/crypto";

const testAccountSchema = z.object({
  role: z.string().max(100),
  username: z.string().max(200),
  // plaintext password from client; we encrypt before storing
  password: z.string().max(500).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  status: z.enum(["in_progress", "under_review", "complete"]).optional(),
  scope: z.string().max(2000).nullable().optional(),
  applicationUrl: z.string().url().max(2000).nullable().optional(),
  testAccounts: z.array(testAccountSchema).nullable().optional(),
  startDate: z.string().datetime({ offset: true }).nullable().optional(),
  endDate: z.string().datetime({ offset: true }).nullable().optional(),
  statusJustification: z.string().optional(),
  playbookVersionId: z.string().uuid().nullable().optional(),
});

const BACKWARD_STATUSES: Record<string, string[]> = {
  complete: ["in_progress", "under_review"],
  under_review: ["in_progress"],
};

function encryptAccounts(
  accounts: Array<{ role: string; username: string; password?: string }>
): TestAccount[] {
  return accounts.map(({ role, username, password }) => ({
    role,
    username,
    ...(password ? { encryptedPassword: encrypt(password) } : {}),
  }));
}

function decryptAccounts(
  accounts: TestAccount[] | null
): Array<{ role: string; username: string; password?: string }> {
  if (!accounts) return [];
  return accounts.map(({ role, username, encryptedPassword }) => ({
    role,
    username,
    ...(encryptedPassword
      ? {
          password: (() => {
            try {
              return decrypt(encryptedPassword);
            } catch {
              return undefined;
            }
          })(),
        }
      : {}),
  }));
}

async function getOrgProject(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, id), eq(project.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  const row = await getOrgProject(session!.user.orgId, id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ...row,
    testAccounts: decryptAccounts(row.testAccounts),
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  if (!(await requireOrgRole(session!.user.id, session!.user.orgId, "member"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const row = await getOrgProject(session!.user.orgId, id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Check if status is a backward transition
  if (parsed.data.status && parsed.data.status !== row.status) {
    const backwards = BACKWARD_STATUSES[row.status];
    if (backwards?.includes(parsed.data.status)) {
      if (!parsed.data.statusJustification?.trim()) {
        return NextResponse.json(
          { error: "A justification is required when moving a project to an earlier status." },
          { status: 422 }
        );
      }
      await db.insert(auditLog).values({
        organizationId: session!.user.orgId,
        userId: session!.user.id,
        action: "status_backward",
        resourceType: "project",
        resourceId: id,
        metadata: {
          from: row.status,
          to: parsed.data.status,
          justification: parsed.data.statusJustification,
        },
      });
    }
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name.trim();
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.scope !== undefined) updateData.scope = parsed.data.scope;
  if (parsed.data.applicationUrl !== undefined)
    updateData.applicationUrl = parsed.data.applicationUrl;
  if (parsed.data.testAccounts !== undefined)
    updateData.testAccounts = parsed.data.testAccounts
      ? encryptAccounts(parsed.data.testAccounts)
      : null;
  if (parsed.data.startDate !== undefined)
    updateData.startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null;
  if (parsed.data.endDate !== undefined)
    updateData.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null;
  if (parsed.data.playbookVersionId !== undefined)
    updateData.playbookVersionId = parsed.data.playbookVersionId;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ ...row, testAccounts: decryptAccounts(row.testAccounts) });
  }

  const [updated] = await db.update(project).set(updateData).where(eq(project.id, id)).returning();

  return NextResponse.json({
    ...updated,
    testAccounts: decryptAccounts(updated.testAccounts),
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  if (!(await requireOrgRole(session!.user.id, session!.user.orgId, "member"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const row = await getOrgProject(session!.user.orgId, id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(project).where(eq(project.id, id));

  return NextResponse.json({ success: true });
}
