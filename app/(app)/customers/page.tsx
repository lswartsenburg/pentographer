import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { customer, project } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { IconPlus } from "@tabler/icons-react";
import { NewCustomerDialog } from "./new-customer-dialog";

export default async function CustomersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const customers = await db
    .select({
      id: customer.id,
      name: customer.name,
      contactEmail: customer.contactEmail,
      createdAt: customer.createdAt,
      projectCount: sql<number>`cast(count(${project.id}) as integer)`,
    })
    .from(customer)
    .leftJoin(project, eq(project.customerId, customer.id))
    .where(eq(customer.userId, session.user.id))
    .groupBy(customer.id)
    .orderBy(desc(customer.createdAt));

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between border-b border-border h-12 px-5 bg-background">
        <h1 className="text-sm font-medium text-foreground">Customers</h1>
        <NewCustomerDialog>
          <Button size="sm">
            <IconPlus size={14} />
            New customer
          </Button>
        </NewCustomerDialog>
      </header>

      <div className="flex-1 p-5">
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {customers.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No customers yet. Add your first client.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Contact email</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Projects</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Added</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/customers/${c.id}`} className="font-medium text-foreground hover:text-primary">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.contactEmail ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{c.projectCount}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
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
