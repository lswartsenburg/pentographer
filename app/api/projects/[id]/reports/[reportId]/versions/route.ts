import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { reportVersion } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { verifyReportAccess } from "@/lib/project-access";

const createSchema = z.object({
  version: z.string().min(1).max(50),
  forkFromVersionId: z.string().uuid().optional(),
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

  const versions = await db
    .select()
    .from(reportVersion)
    .where(eq(reportVersion.reportId, reportId))
    .orderBy(desc(reportVersion.createdAt));

  return NextResponse.json(versions);
}

export async function POST(
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  let execSummary = "";
  let authorType: "human" | "ai" = "human";

  if (parsed.data.forkFromVersionId) {
    const [source] = await db
      .select()
      .from(reportVersion)
      .where(eq(reportVersion.id, parsed.data.forkFromVersionId))
      .limit(1);
    if (source && source.reportId === reportId) {
      execSummary = source.execSummary;
      authorType = source.authorType;
    }
  }

  const [newVersion] = await db
    .insert(reportVersion)
    .values({
      reportId,
      version: parsed.data.version,
      status: "draft",
      execSummary,
      authorType,
    })
    .returning();

  return NextResponse.json(newVersion, { status: 201 });
}
