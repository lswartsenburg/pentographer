import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { project, report, reportVersion } from "@/db/schema";
import { getOrgRole } from "./org-access";

export async function verifyProjectAccess(userId: string, projectId: string): Promise<boolean> {
  const [row] = await db
    .select({ orgId: project.organizationId })
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1);
  if (!row) return false;
  return !!(await getOrgRole(userId, row.orgId));
}

export async function verifyReportAccess(
  userId: string,
  projectId: string,
  reportId: string
): Promise<boolean> {
  if (!(await verifyProjectAccess(userId, projectId))) return false;

  const [row] = await db
    .select({ id: report.id })
    .from(report)
    .where(and(eq(report.id, reportId), eq(report.projectId, projectId)))
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
