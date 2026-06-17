import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { project, customer, playbookVersion, playbook, finding, executiveSummaryVersion, auditLog } from "@/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { IconDownload, IconPlus, IconSparkles } from "@tabler/icons-react";
import { ProjectTabs } from "./project-tabs";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    in_progress: "bg-[#E6F1FB] text-[#0C447C]",
    under_review: "bg-[#FAEEDA] text-[#633806]",
    complete: "bg-[#EAF3DE] text-[#27500A]",
  };
  const labels: Record<string, string> = {
    in_progress: "In Progress",
    under_review: "Under Review",
    complete: "Complete",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${styles[status] ?? "bg-muted text-muted-foreground"}`}>
      {labels[status] ?? status}
    </span>
  );
}

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

  const [latestExecSummary] = await db
    .select()
    .from(executiveSummaryVersion)
    .where(eq(executiveSummaryVersion.projectId, id))
    .orderBy(desc(executiveSummaryVersion.createdAt))
    .limit(1);

  const execSummaryHistory = await db
    .select()
    .from(executiveSummaryVersion)
    .where(eq(executiveSummaryVersion.projectId, id))
    .orderBy(desc(executiveSummaryVersion.createdAt));

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
          <Link href="/projects" className="hover:text-foreground">Projects</Link>
          <span>/</span>
          <span className="text-foreground font-medium">{proj.customerName ?? "Project"}</span>
          <span>/</span>
          <span className="text-foreground font-medium">{proj.name}</span>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/projects/${id}/export`}>
              <IconDownload size={14} />
              Export
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left metadata panel */}
        <div className="w-64 shrink-0 bg-background border-r border-border overflow-y-auto p-4">
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">Status</p>
              <StatusBadge status={proj.status} />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">Customer</p>
              <p className="text-foreground font-medium">{proj.customerName ?? "—"}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">Playbook</p>
              <p className="text-foreground">
                {proj.playbookName ? `${proj.playbookName} — v${proj.playbookVersion}` : "—"}
              </p>
            </div>
            {proj.scope && (
              <div>
                <p className="text-[11px] text-muted-foreground mb-0.5">Scope</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{proj.scope}</p>
              </div>
            )}
            {proj.startDate && (
              <div>
                <p className="text-[11px] text-muted-foreground mb-0.5">Start date</p>
                <p className="text-foreground">
                  {new Date(proj.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
            )}
            {proj.endDate && (
              <div>
                <p className="text-[11px] text-muted-foreground mb-0.5">End date</p>
                <p className="text-foreground">
                  {new Date(proj.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
            )}

            {/* Risk summary */}
            <div className="pt-2 border-t border-border">
              <p className="text-[11px] text-muted-foreground mb-2 uppercase tracking-wide font-medium">Risk summary</p>
              <div className="grid grid-cols-3 gap-1.5">
                <div className="bg-[#FCEBEB] rounded-md p-2 text-center">
                  <p className="text-lg font-semibold text-[#A32D2D]">{highCount?.c ?? 0}</p>
                  <p className="text-[10px] text-[#A32D2D]">High</p>
                </div>
                <div className="bg-[#FAEEDA] rounded-md p-2 text-center">
                  <p className="text-lg font-semibold text-[#633806]">{medCount?.c ?? 0}</p>
                  <p className="text-[10px] text-[#633806]">Med</p>
                </div>
                <div className="bg-[#EAF3DE] rounded-md p-2 text-center">
                  <p className="text-lg font-semibold text-[#27500A]">{lowCount?.c ?? 0}</p>
                  <p className="text-[10px] text-[#27500A]">Low</p>
                </div>
              </div>
            </div>
          </div>
        </div>

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
            latestExecSummary={latestExecSummary ? { content: latestExecSummary.content, createdAt: latestExecSummary.createdAt.toISOString() } : null}
            execSummaryHistory={execSummaryHistory.map((v) => ({
              id: v.id,
              authorType: v.authorType,
              createdAt: v.createdAt.toISOString(),
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
