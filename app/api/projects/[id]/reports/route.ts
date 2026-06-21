import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { report, reportVersion } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { verifyProjectAccess } from "@/lib/project-access";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  templateId: z.string().uuid().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId } = await params;

  if (!(await verifyProjectAccess(session!.user.id, projectId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const reports = await db
    .select()
    .from(report)
    .where(eq(report.projectId, projectId))
    .orderBy(desc(report.createdAt));

  const reportsWithVersions = await Promise.all(
    reports.map(async (r) => {
      const versions = await db
        .select()
        .from(reportVersion)
        .where(eq(reportVersion.reportId, r.id))
        .orderBy(desc(reportVersion.createdAt));
      return { ...r, versions };
    })
  );

  return NextResponse.json(reportsWithVersions);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId } = await params;

  if (!(await verifyProjectAccess(session!.user.id, projectId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const [newReport] = await db
    .insert(report)
    .values({
      projectId,
      userId: session!.user.id,
      name: parsed.data.name,
      templateId: parsed.data.templateId ?? null,
    })
    .returning();

  const [firstVersion] = await db
    .insert(reportVersion)
    .values({
      reportId: newReport.id,
      version: "1.0",
      status: "draft",
      execSummary: "",
      authorType: "human",
    })
    .returning();

  return NextResponse.json({ ...newReport, versions: [firstVersion] }, { status: 201 });
}
