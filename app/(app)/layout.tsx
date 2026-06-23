import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { db } from "@/db/client";
import { organization } from "@/db/schema";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [org] = session.user.orgId
    ? await db
        .select({ name: organization.name })
        .from(organization)
        .where(eq(organization.id, session.user.orgId))
        .limit(1)
    : [];

  return (
    <SidebarProvider>
      <AppSidebar user={session.user} orgName={org?.name} />
      <SidebarInset className="min-h-screen overflow-x-hidden">{children}</SidebarInset>
      <Toaster />
    </SidebarProvider>
  );
}
