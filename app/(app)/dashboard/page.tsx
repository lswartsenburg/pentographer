import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { project, finding, customer } from "@/db/schema";
import { eq, and, inArray, count, sql } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { IconPlus } from "@tabler/icons-react";

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
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${styles[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const orgId = session.user.orgId;

  // All org projects
  const userProjects = await db
    .select({ id: project.id, status: project.status })
    .from(project)
    .where(eq(project.organizationId, orgId));

  const projectIds = userProjects.map((p) => p.id);

  const activeProjectCount = userProjects.filter(
    (p) => p.status === "in_progress" || p.status === "under_review"
  ).length;

  let totalFindings = 0;
  let highRiskFindings = 0;

  if (projectIds.length > 0) {
    const [findingStats] = await db
      .select({ total: count() })
      .from(finding)
      .where(inArray(finding.projectId, projectIds));

    totalFindings = findingStats?.total ?? 0;

    const [highStats] = await db
      .select({ total: count() })
      .from(finding)
      .where(and(inArray(finding.projectId, projectIds), eq(finding.riskLevel, "high")));

    highRiskFindings = highStats?.total ?? 0;
  }

  // Recent 5 projects with customer name and finding count
  const recentProjects = await db
    .select({
      id: project.id,
      name: project.name,
      status: project.status,
      customerName: customer.name,
      createdAt: project.createdAt,
      findingCount: sql<number>`cast(count(${finding.id}) as integer)`,
    })
    .from(project)
    .leftJoin(customer, eq(project.customerId, customer.id))
    .leftJoin(finding, eq(finding.projectId, project.id))
    .where(eq(project.organizationId, orgId))
    .groupBy(project.id, customer.name)
    .orderBy(sql`${project.createdAt} desc`)
    .limit(5);

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between border-b border-border h-12 px-5 bg-background">
        <h1 className="text-sm font-medium text-foreground">Dashboard</h1>
        <Link href="/projects/new">
          <Button size="sm">
            <IconPlus size={14} />
            New project
          </Button>
        </Link>
      </header>

      <div className="flex-1 p-5 space-y-4">
        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">Active projects</p>
            <p className="text-2xl font-semibold text-foreground">{activeProjectCount}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">Total findings</p>
            <p className="text-2xl font-semibold text-foreground">{totalFindings}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">High risk</p>
            <p className="text-2xl font-semibold text-[#A32D2D]">{highRiskFindings}</p>
          </div>
        </div>

        {/* Recent projects */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Recent projects
            </p>
          </div>
          {recentProjects.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No projects yet.{" "}
              <Link href="/projects/new" className="text-primary hover:underline">
                Create your first project
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                    Project
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                    Customer
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">
                    Findings
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentProjects.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/projects/${p.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.customerName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{p.findingCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
