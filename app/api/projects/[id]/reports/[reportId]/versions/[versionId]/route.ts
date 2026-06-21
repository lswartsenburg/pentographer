import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { reportVersion } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { verifyReportVersionAccess } from "@/lib/project-access";

const patchSchema = z.object({
  execSummary: z.string().optional(),
  reportDate: z.string().datetime().nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; reportId: string; versionId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId, reportId, versionId } = await params;

  const access = await verifyReportVersionAccess(session!.user.id, projectId, reportId, versionId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(access.reportVersionRow);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reportId: string; versionId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId, reportId, versionId } = await params;

  const access = await verifyReportVersionAccess(session!.user.id, projectId, reportId, versionId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (access.reportVersionRow.status === "published") {
    return NextResponse.json(
      { error: "Published report versions cannot be edited" },
      { status: 409 }
    );
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

  const updates: Partial<typeof reportVersion.$inferInsert> = {};
  if (parsed.data.execSummary !== undefined) {
    updates.execSummary = parsed.data.execSummary;
    updates.authorType = "human";
  }
  if (parsed.data.reportDate !== undefined) {
    updates.reportDate = parsed.data.reportDate ? new Date(parsed.data.reportDate) : null;
  }

  const [updated] = await db
    .update(reportVersion)
    .set(updates)
    .where(eq(reportVersion.id, versionId))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; reportId: string; versionId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId, reportId, versionId } = await params;

  const access = await verifyReportVersionAccess(session!.user.id, projectId, reportId, versionId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (access.reportVersionRow.status === "published") {
    return NextResponse.json(
      { error: "Published report versions cannot be deleted" },
      { status: 409 }
    );
  }

  await db.delete(reportVersion).where(eq(reportVersion.id, versionId));
  return NextResponse.json({ deleted: true });
}
