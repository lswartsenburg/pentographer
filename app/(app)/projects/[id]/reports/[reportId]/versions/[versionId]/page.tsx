import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db/client";
import {
  project,
  customer,
  report,
  reportVersion,
  finding,
  findingVersion,
  type riskLevelEnum,
} from "@/db/schema";

type RiskLevel = (typeof riskLevelEnum.enumValues)[number];
import { eq, and, desc } from "drizzle-orm";
import { ReportVersionEditor } from "./report-version-editor";

export default async function ReportVersionPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string; versionId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id: projectId, reportId, versionId } = await params;

  const [proj] = await db
    .select({ id: project.id, name: project.name, customerId: project.customerId })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, session.user.id)))
    .limit(1);
  if (!proj) notFound();

  const [cust] = await db
    .select({ name: customer.name })
    .from(customer)
    .where(eq(customer.id, proj.customerId))
    .limit(1);

  const [rep] = await db
    .select({ id: report.id, name: report.name })
    .from(report)
    .where(and(eq(report.id, reportId), eq(report.projectId, projectId)))
    .limit(1);
  if (!rep) notFound();

  const [rv] = await db
    .select()
    .from(reportVersion)
    .where(and(eq(reportVersion.id, versionId), eq(reportVersion.reportId, reportId)))
    .limit(1);
  if (!rv) notFound();

  const isPublished = rv.status === "published";

  let findings: { id: string; title: string; riskLevel: RiskLevel; status: string }[];

  if (isPublished && rv.findingSnapshot) {
    // Resolve snapshot — each finding pinned to a specific findingVersion
    const allFindings = await db
      .select({ id: finding.id, title: finding.title, riskLevel: finding.riskLevel })
      .from(finding)
      .where(eq(finding.projectId, projectId));

    findings = await Promise.all(
      allFindings
        .filter((f) => rv.findingSnapshot!.some((s) => s.findingId === f.id))
        .map(async (f) => {
          const fvId = rv.findingSnapshot!.find((s) => s.findingId === f.id)!.findingVersionId;
          const [fv] = await db
            .select({ status: findingVersion.status })
            .from(findingVersion)
            .where(eq(findingVersion.id, fvId))
            .limit(1);
          return { ...f, status: fv?.status ?? "confirmed" };
        })
    );
  } else {
    // Draft/in_review — pass all project findings with their current status
    findings = (await db
      .select({
        id: finding.id,
        title: finding.title,
        riskLevel: finding.riskLevel,
        status: finding.status,
      })
      .from(finding)
      .where(eq(finding.projectId, projectId))
      .orderBy(desc(finding.createdAt))) as {
      id: string;
      title: string;
      riskLevel: RiskLevel;
      status: string;
    }[];
  }

  return (
    <ReportVersionEditor
      projectId={projectId}
      projectName={proj.name}
      customerName={cust?.name ?? ""}
      reportId={reportId}
      reportName={rep.name}
      versionId={versionId}
      version={rv.version}
      status={rv.status}
      initialExecSummary={rv.execSummary}
      findings={findings}
      initialIncludedFindingIds={rv.includedFindingIds ?? null}
    />
  );
}
