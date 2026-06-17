import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { project, finding, playbookItem, auditLog } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

const patchSchema = z.object({
  playbookItemId: z.string().uuid().nullable().optional(),
  isAdhoc: z.boolean().optional(),
});

async function getOwnedFinding(userId: string, projectId: string, findingId: string) {
  const [proj] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)))
    .limit(1);
  if (!proj) return null;

  const [row] = await db
    .select()
    .from(finding)
    .where(and(eq(finding.id, findingId), eq(finding.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; findingId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId, findingId } = await params;

  const row = await getOwnedFinding(session!.user.id, projectId, findingId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Audit log every read
  await db.insert(auditLog).values({
    userId: session!.user.id,
    action: "read",
    resourceType: "finding",
    resourceId: findingId,
    metadata: { projectId },
  });

  return NextResponse.json(row);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; findingId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId, findingId } = await params;

  const row = await getOwnedFinding(session!.user.id, projectId, findingId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // If linking a playbook item, verify it exists
  if (parsed.data.playbookItemId) {
    const [item] = await db
      .select({ id: playbookItem.id })
      .from(playbookItem)
      .where(eq(playbookItem.id, parsed.data.playbookItemId))
      .limit(1);
    if (!item) return NextResponse.json({ error: "Playbook item not found" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if ("playbookItemId" in parsed.data) update.playbookItemId = parsed.data.playbookItemId ?? null;
  if ("isAdhoc" in parsed.data) update.isAdhoc = parsed.data.isAdhoc;

  const [updated] = await db
    .update(finding)
    .set(update)
    .where(eq(finding.id, findingId))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; findingId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId, findingId } = await params;

  const row = await getOwnedFinding(session!.user.id, projectId, findingId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(finding).where(eq(finding.id, findingId));

  return NextResponse.json({ success: true });
}
