import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { project, customer, playbookVersion, playbook, finding } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
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
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${styles[status] ?? "bg-muted text-muted-foreground"}`}>
      {labels[status] ?? status}
    </span>
  );
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { status: filterStatus } = await searchParams;

  const projects = await db
    .select({
      id: project.id,
      name: project.name,
      status: project.status,
      startDate: project.startDate,
      endDate: project.endDate,
      createdAt: project.createdAt,
      customerName: customer.name,
      playbookName: playbook.name,
      playbookVersionLabel: playbookVersion.version,
      findingCount: sql<number>`cast(count(${finding.id}) as integer)`,
    })
    .from(project)
    .leftJoin(customer, eq(project.customerId, customer.id))
    .leftJoin(playbookVersion, eq(project.playbookVersionId, playbookVersion.id))
    .leftJoin(playbook, eq(playbookVersion.playbookId, playbook.id))
    .leftJoin(finding, eq(finding.projectId, project.id))
    .where(
      filterStatus && filterStatus !== "all"
        ? and(
            eq(project.userId, session.user.id),
            eq(project.status, filterStatus as "in_progress" | "under_review" | "complete")
          )
        : eq(project.userId, session.user.id)
    )
    .groupBy(project.id, customer.name, playbook.name, playbookVersion.version)
    .orderBy(desc(project.createdAt));

  const tabs = [
    { value: "all", label: "All" },
    { value: "in_progress", label: "In Progress" },
    { value: "under_review", label: "Under Review" },
    { value: "complete", label: "Complete" },
  ];

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between border-b border-border h-12 px-5 bg-background">
        <h1 className="text-sm font-medium text-foreground">Projects</h1>
        <Link href="/projects/new">
          <Button size="sm">
            <IconPlus size={14} />
            New project
          </Button>
        </Link>
      </header>

      <div className="border-b border-border px-5">
        <div className="flex gap-0">
          {tabs.map((tab) => {
            const active = (filterStatus ?? "all") === tab.value;
            return (
              <Link
                key={tab.value}
                href={tab.value === "all" ? "/projects" : `/projects?status=${tab.value}`}
                className={`px-3.5 py-2.5 text-xs border-b-2 transition-colors ${
                  active
                    ? "border-primary text-primary font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex-1 p-5">
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {projects.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No projects found.{" "}
              <Link href="/projects/new" className="text-primary hover:underline">Create one</Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Project</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Customer</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Playbook</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Findings</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/projects/${p.id}`} className="font-medium text-foreground hover:text-primary">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.customerName ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {p.playbookName ? `${p.playbookName} v${p.playbookVersionLabel}` : "—"}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
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
