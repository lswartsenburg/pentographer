import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { project, auditLog } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

const testAccountSchema = z.object({ role: z.string().max(100), username: z.string().max(200) });

const updateSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  status: z.enum(["in_progress", "under_review", "complete"]).optional(),
  scope: z.string().max(2000).nullable().optional(),
  applicationUrl: z.string().url().max(2000).nullable().optional(),
  reportVersion: z.string().max(50).nullable().optional(),
  testAccounts: z.array(testAccountSchema).nullable().optional(),
  startDate: z.string().datetime({ offset: true }).nullable().optional(),
  endDate: z.string().datetime({ offset: true }).nullable().optional(),
  statusJustification: z.string().optional(),
});

const BACKWARD_STATUSES: Record<string, string[]> = {
  complete: ["in_progress", "under_review"],
  under_review: ["in_progress"],
};

async function getOwnedProject(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, id), eq(project.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  const row = await getOwnedProject(session!.user.id, id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(row);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  const row = await getOwnedProject(session!.user.id, id);
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
  if (parsed.data.reportVersion !== undefined) updateData.reportVersion = parsed.data.reportVersion;
  if (parsed.data.testAccounts !== undefined) updateData.testAccounts = parsed.data.testAccounts;
  if (parsed.data.startDate !== undefined)
    updateData.startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null;
  if (parsed.data.endDate !== undefined)
    updateData.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null;

  const [updated] = await db.update(project).set(updateData).where(eq(project.id, id)).returning();

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  const row = await getOwnedProject(session!.user.id, id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(project).where(eq(project.id, id));

  return NextResponse.json({ success: true });
}
