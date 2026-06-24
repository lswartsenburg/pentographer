import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SettingsSidebar } from "@/components/settings-sidebar";
import { Toaster } from "@/components/ui/sonner";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <SidebarProvider>
      <SettingsSidebar />
      <SidebarInset className="min-h-screen overflow-x-hidden">{children}</SidebarInset>
      <Toaster />
    </SidebarProvider>
  );
}
