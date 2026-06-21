import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { report, reportVersion } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { verifyReportAccess } from "@/lib/project-access";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  templateId: z.string().uuid().nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; reportId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId, reportId } = await params;

  if (!(await verifyReportAccess(session!.user.id, projectId, reportId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [row] = await db.select().from(report).where(eq(report.id, reportId)).limit(1);

  const versions = await db
    .select()
    .from(reportVersion)
    .where(eq(reportVersion.reportId, reportId))
    .orderBy(desc(reportVersion.createdAt));

  return NextResponse.json({ ...row, versions });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reportId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId, reportId } = await params;

  if (!(await verifyReportAccess(session!.user.id, projectId, reportId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const updates: Partial<typeof report.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.templateId !== undefined) updates.templateId = parsed.data.templateId;

  const [updated] = await db.update(report).set(updates).where(eq(report.id, reportId)).returning();

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; reportId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId, reportId } = await params;

  if (!(await verifyReportAccess(session!.user.id, projectId, reportId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(report).where(and(eq(report.id, reportId)));
  return NextResponse.json({ deleted: true });
}
