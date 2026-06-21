import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { finding, findingVersion, reportVersion } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { verifyReportVersionAccess } from "@/lib/project-access";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; reportId: string; versionId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId, reportId, versionId } = await params;

  const access = await verifyReportVersionAccess(session!.user.id, projectId, reportId, versionId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (access.reportVersionRow.status === "published") {
    return NextResponse.json({ error: "Already published" }, { status: 409 });
  }

  // Snapshot the current latest findingVersion for each finding in the project
  const findings = await db
    .select({ id: finding.id })
    .from(finding)
    .where(eq(finding.projectId, projectId));

  const snapshot = await Promise.all(
    findings.map(async ({ id: findingId }) => {
      const [latest] = await db
        .select({ id: findingVersion.id })
        .from(findingVersion)
        .where(eq(findingVersion.findingId, findingId))
        .orderBy(desc(findingVersion.createdAt))
        .limit(1);
      return latest ? { findingId, findingVersionId: latest.id } : null;
    })
  );

  const now = new Date();

  const [published] = await db
    .update(reportVersion)
    .set({
      status: "published",
      findingSnapshot: snapshot.filter(Boolean) as {
        findingId: string;
        findingVersionId: string;
      }[],
      publishedAt: now,
      reportDate: access.reportVersionRow.reportDate ?? now,
    })
    .where(eq(reportVersion.id, versionId))
    .returning();

  return NextResponse.json(published);
}
