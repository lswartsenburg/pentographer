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
  userAccount,
} from "@/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { ProjectTabs } from "./project-tabs";
import { ProjectSidebar } from "./project-sidebar";
import { ProjectActions } from "./project-actions";
import { decrypt } from "@/lib/crypto";
import type { TestAccount } from "@/db/schema";

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
    .where(and(eq(project.id, id), eq(project.organizationId, session.user.orgId)))
    .limit(1);

  if (!proj) notFound();

  function decryptAccounts(accounts: TestAccount[] | null) {
    if (!accounts) return null;
    return accounts.map(({ role, username, encryptedPassword }) => ({
      role,
      username,
      password: encryptedPassword
        ? (() => {
            try {
              return decrypt(encryptedPassword);
            } catch {
              return undefined;
            }
          })()
        : undefined,
    }));
  }

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

  const rawActivityLog = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      createdAt: auditLog.createdAt,
      metadata: auditLog.metadata,
      actorName: userAccount.name,
    })
    .from(auditLog)
    .leftJoin(userAccount, eq(auditLog.userId, userAccount.id))
    .where(and(eq(auditLog.resourceType, "project"), eq(auditLog.resourceId, id)))
    .orderBy(desc(auditLog.createdAt))
    .limit(50);

  // Build a flat map of versionId → { reportName, version } for quick lookup
  const versionIndex = new Map<string, { reportName: string; version: string }>();
  for (const r of reportsWithVersions) {
    for (const v of r.versions) {
      versionIndex.set(v.id, { reportName: r.name, version: v.version });
    }
  }

  const activityLog = rawActivityLog.map((e) => {
    const meta = e.metadata as Record<string, string> | null;
    const rvId = meta?.reportVersionId ?? null;
    const reportInfo = rvId ? (versionIndex.get(rvId) ?? null) : null;
    return {
      id: e.id,
      action: e.action,
      createdAt: e.createdAt.toISOString(),
      actorName: e.actorName ?? null,
      // export-specific
      format: meta?.format ?? null,
      reportName: reportInfo?.reportName ?? null,
      reportVersion: reportInfo?.version ?? null,
      // status_backward-specific
      statusFrom: meta?.from ?? null,
      statusTo: meta?.to ?? null,
      justification: meta?.justification ?? null,
    };
  });

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
        <ProjectActions projectId={id} currentName={proj.name} />
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left metadata panel */}
        <ProjectSidebar
          projectId={id}
          status={proj.status}
          customerName={proj.customerName ?? null}
          playbookVersionId={proj.playbookVersionId ?? null}
          playbookName={proj.playbookName ?? null}
          playbookVersion={proj.playbookVersion ?? null}
          scope={proj.scope ?? null}
          applicationUrl={proj.applicationUrl ?? null}
          testAccounts={decryptAccounts(proj.testAccounts ?? null)}
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
            activityLog={activityLog}
          />
        </div>
      </div>
    </div>
  );
}
