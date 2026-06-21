import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { project, report, reportVersion } from "@/db/schema";

export async function verifyProjectAccess(userId: string, projectId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)))
    .limit(1);
  return !!row;
}

export async function verifyReportAccess(
  userId: string,
  projectId: string,
  reportId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: report.id })
    .from(report)
    .where(and(eq(report.id, reportId), eq(report.projectId, projectId), eq(report.userId, userId)))
    .limit(1);
  return !!row;
}

export async function verifyReportVersionAccess(
  userId: string,
  projectId: string,
  reportId: string,
  versionId: string
): Promise<{ reportVersionRow: typeof reportVersion.$inferSelect } | null> {
  if (!(await verifyReportAccess(userId, projectId, reportId))) return null;

  const [row] = await db
    .select()
    .from(reportVersion)
    .where(and(eq(reportVersion.id, versionId), eq(reportVersion.reportId, reportId)))
    .limit(1);

  return row ? { reportVersionRow: row } : null;
}
