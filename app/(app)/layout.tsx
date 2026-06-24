import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SessionProvider } from "@/components/session-provider";
import { Toaster } from "@/components/ui/sonner";
import { db } from "@/db/client";
import { organization, organizationMember } from "@/db/schema";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const orgs = await db
    .select({
      id: organization.id,
      name: organization.name,
      role: organizationMember.role,
    })
    .from(organizationMember)
    .innerJoin(organization, eq(organizationMember.organizationId, organization.id))
    .where(eq(organizationMember.userId, session.user.id))
    .orderBy(organization.name);

  return (
    <SessionProvider>
      <SidebarProvider>
        <AppSidebar user={session.user} orgId={session.user.orgId} orgs={orgs} />
        <SidebarInset className="min-h-screen overflow-x-hidden">{children}</SidebarInset>
        <Toaster />
      </SidebarProvider>
    </SessionProvider>
  );
}
