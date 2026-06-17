import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { customer, project } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

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

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;

  const [c] = await db
    .select()
    .from(customer)
    .where(and(eq(customer.id, id), eq(customer.userId, session.user.id)))
    .limit(1);

  if (!c) notFound();

  const projects = await db
    .select()
    .from(project)
    .where(eq(project.customerId, c.id))
    .orderBy(desc(project.createdAt));

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-2 border-b border-border h-12 px-5 bg-background">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/customers" className="hover:text-foreground">Customers</Link>
          <span>/</span>
          <span className="text-foreground font-medium">{c.name}</span>
        </nav>
      </header>

      <div className="flex-1 p-5 space-y-4 max-w-3xl">
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-base font-semibold mb-3">{c.name}</h2>
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Contact email</dt>
            <dd className="text-foreground">{c.contactEmail ?? "—"}</dd>
            <dt className="text-muted-foreground">Added</dt>
            <dd className="text-foreground">
              {new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </dd>
          </dl>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Projects</p>
          </div>
          {projects.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No projects for this customer yet.{" "}
              <Link href="/projects/new" className="text-primary hover:underline">Create one</Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Project</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Start date</th>
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
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.startDate
                        ? new Date(p.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : "—"}
                    </td>
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
