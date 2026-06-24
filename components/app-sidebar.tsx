"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  IconLayoutDashboard,
  IconFolder,
  IconBook,
  IconBuilding,
  IconSettings,
  IconLogout,
  IconChevronDown,
  IconTemplate,
  IconUsers,
  IconCheck,
  IconLoader2,
  IconPlus,
} from "@tabler/icons-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogoWordmark } from "@/components/logo";

const workNav = [
  { href: "/dashboard", label: "Dashboard", icon: IconLayoutDashboard },
  { href: "/projects", label: "Projects", icon: IconFolder },
];

const resourcesNav = [
  { href: "/playbooks", label: "Playbooks", icon: IconBook },
  { href: "/templates", label: "Templates", icon: IconTemplate },
  { href: "/customers", label: "Customers", icon: IconBuilding },
];

const organizationNav = [{ href: "/settings/team", label: "Members", icon: IconUsers }];

interface OrgSummary {
  id: string;
  name: string;
  role: string;
}

interface AppSidebarProps {
  user: {
    name?: string | null;
    email?: string | null;
  };
  orgId: string;
  orgs: OrgSummary[];
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  if (email) return email[0].toUpperCase();
  return "?";
}

export function AppSidebar({ user, orgId, orgs }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { update } = useSession();
  const [switching, setSwitching] = useState(false);
  const [newOrgOpen, setNewOrgOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);

  const currentOrg = orgs.find((o) => o.id === orgId);

  const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
  const logoHref = projectMatch ? `/projects/${projectMatch[1]}` : "/dashboard";

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/settings/organization") return pathname.startsWith("/settings/organization");
    if (href === "/settings/team") return pathname.startsWith("/settings/team");
    return pathname.startsWith(href);
  };

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newOrgName.trim() }),
      });
      if (!res.ok) return;
      const { id } = await res.json();
      setNewOrgOpen(false);
      setNewOrgName("");
      await update({ orgId: id });
      router.refresh();
    } finally {
      setCreatingOrg(false);
    }
  }

  async function handleSwitch(newOrgId: string) {
    if (newOrgId === orgId || switching) return;
    setSwitching(true);
    try {
      const res = await fetch("/api/orgs/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: newOrgId }),
      });
      if (res.ok) {
        await update({ orgId: newOrgId });
        router.refresh();
      }
    } finally {
      setSwitching(false);
    }
  }

  return (
    <>
      <Sidebar>
        <SidebarHeader className="border-b border-sidebar-border px-4 h-12 flex-row items-center">
          <Link href={logoHref}>
            <LogoWordmark size="sm" />
          </Link>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Work</SidebarGroupLabel>
            <SidebarMenu>
              {workNav.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton asChild isActive={isActive(href)} tooltip={label}>
                    <Link href={href}>
                      <Icon size={16} />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Resources</SidebarGroupLabel>
            <SidebarMenu>
              {resourcesNav.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton asChild isActive={isActive(href)} tooltip={label}>
                    <Link href={href}>
                      <Icon size={16} />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Organization</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive("/settings/organization")}
                  tooltip="Settings"
                >
                  <Link href="/settings/organization">
                    <IconSettings size={16} />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {organizationNav.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton asChild isActive={isActive(href)} tooltip={label}>
                    <Link href={href}>
                      <Icon size={16} />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border">
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton className="h-auto py-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E6F1FB] text-[10px] font-semibold text-[#0C447C]">
                      {switching ? (
                        <IconLoader2 size={12} className="animate-spin text-[#0C447C]" />
                      ) : (
                        getInitials(user.name, user.email)
                      )}
                    </div>
                    <div className="flex flex-col min-w-0 text-left">
                      <span className="truncate text-xs font-medium text-sidebar-foreground">
                        {user.name ?? "User"}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {currentOrg?.name ?? user.email}
                      </span>
                    </div>
                    <IconChevronDown size={14} className="ml-auto text-muted-foreground" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-56">
                  {orgs.length > 0 && (
                    <>
                      <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-2 py-1.5">
                        Organizations
                      </DropdownMenuLabel>
                      {orgs.map((org) => (
                        <DropdownMenuItem
                          key={org.id}
                          onClick={() => handleSwitch(org.id)}
                          disabled={switching}
                          className="flex items-center gap-2"
                        >
                          <span className="flex-1 truncate">{org.name}</span>
                          {org.id === orgId && (
                            <IconCheck size={13} className="shrink-0 text-primary" />
                          )}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuItem
                        onClick={() => setNewOrgOpen(true)}
                        className="text-muted-foreground"
                      >
                        <IconPlus size={13} />
                        New organization
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-2 py-1.5">
                    Your account
                  </DropdownMenuLabel>
                  <DropdownMenuItem asChild>
                    <Link href="/settings">
                      <IconSettings size={14} />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="text-destructive focus:text-destructive"
                  >
                    <IconLogout size={14} />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <Dialog open={newOrgOpen} onOpenChange={setNewOrgOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New organization</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateOrg} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-org-name" className="text-xs">
                Organization name
              </Label>
              <Input
                id="new-org-name"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="e.g. Acme Security"
                className="h-8 text-sm"
                autoFocus
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNewOrgOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={creatingOrg || !newOrgName.trim()}>
                {creatingOrg ? "Creating…" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
