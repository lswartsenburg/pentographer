import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import {
  project,
  customer,
  playbookVersion,
  playbook,
  finding,
  report,
  reportVersion,
  auditLog,
} from "@/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { ProjectTabs } from "./project-tabs";
import { ProjectSidebar } from "./project-sidebar";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;

  const [proj] = await db
    .select({
      id: project.id,
      name: project.name,
      status: project.status,
      scope: project.scope,
      applicationUrl: project.applicationUrl,
      testAccounts: project.testAccounts,
      startDate: project.startDate,
      endDate: project.endDate,
      createdAt: project.createdAt,
      customerId: project.customerId,
      customerName: customer.name,
      playbookVersionId: project.playbookVersionId,
      playbookVersion: playbookVersion.version,
      playbookName: playbook.name,
    })
    .from(project)
    .leftJoin(customer, eq(project.customerId, customer.id))
    .leftJoin(playbookVersion, eq(project.playbookVersionId, playbookVersion.id))
    .leftJoin(playbook, eq(playbookVersion.playbookId, playbook.id))
    .where(and(eq(project.id, id), eq(project.userId, session.user.id)))
    .limit(1);

  if (!proj) notFound();

  const findings = await db
    .select()
    .from(finding)
    .where(eq(finding.projectId, id))
    .orderBy(desc(finding.createdAt));

  const [highCount] = await db
    .select({ c: count() })
    .from(finding)
    .where(and(eq(finding.projectId, id), eq(finding.riskLevel, "high")));

  const [medCount] = await db
    .select({ c: count() })
    .from(finding)
    .where(and(eq(finding.projectId, id), eq(finding.riskLevel, "medium")));

  const [lowCount] = await db
    .select({ c: count() })
    .from(finding)
    .where(and(eq(finding.projectId, id), eq(finding.riskLevel, "low")));

  const reports = await db
    .select()
    .from(report)
    .where(eq(report.projectId, id))
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

  const exportHistory = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.resourceType, "project"),
        eq(auditLog.resourceId, id),
        eq(auditLog.action, "export")
      )
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(20);

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between border-b border-border h-12 px-5 bg-background">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/projects" className="hover:text-foreground">
            Projects
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{proj.customerName ?? "Project"}</span>
          <span>/</span>
          <span className="text-foreground font-medium">{proj.name}</span>
        </nav>
        <div className="flex items-center gap-2" />
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left metadata panel */}
        <ProjectSidebar
          projectId={id}
          status={proj.status}
          customerName={proj.customerName ?? null}
          playbookName={proj.playbookName ?? null}
          playbookVersion={proj.playbookVersion ?? null}
          scope={proj.scope ?? null}
          applicationUrl={proj.applicationUrl ?? null}
          testAccounts={proj.testAccounts ?? null}
          startDate={proj.startDate?.toISOString() ?? null}
          endDate={proj.endDate?.toISOString() ?? null}
          highCount={highCount?.c ?? 0}
          medCount={medCount?.c ?? 0}
          lowCount={lowCount?.c ?? 0}
        />

        {/* Main content tabs */}
        <div className="flex-1 min-w-0 flex flex-col">
          <ProjectTabs
            projectId={id}
            findings={findings.map((f) => ({
              id: f.id,
              title: f.title,
              riskLevel: f.riskLevel,
              status: f.status,
              isAdhoc: f.isAdhoc,
            }))}
            reports={reportsWithVersions.map((r) => ({
              id: r.id,
              name: r.name,
              createdAt: r.createdAt.toISOString(),
              versions: r.versions.map((v) => ({
                id: v.id,
                version: v.version,
                status: v.status,
                publishedAt: v.publishedAt?.toISOString() ?? null,
                createdAt: v.createdAt.toISOString(),
              })),
            }))}
            exportHistory={exportHistory.map((e) => ({
              id: e.id,
              action: e.action,
              createdAt: e.createdAt.toISOString(),
              metadata: e.metadata as Record<string, unknown> | null,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
