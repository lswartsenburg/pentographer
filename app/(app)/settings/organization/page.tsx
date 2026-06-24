import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { organization, organizationMember, userAccount } from "@/db/schema";
import { OrgSettingsForm } from "./org-settings-form";

export default async function OrganizationSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!session.user.orgId) redirect("/login");

  const orgId = session.user.orgId;

  const [[org], [membership], [user]] = await Promise.all([
    db
      .select({
        id: organization.id,
        name: organization.name,
        hasKey: organization.anthropicApiKey,
      })
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1),
    db
      .select({ role: organizationMember.role })
      .from(organizationMember)
      .where(
        and(
          eq(organizationMember.organizationId, orgId),
          eq(organizationMember.userId, session.user.id)
        )
      )
      .limit(1),
    db
      .select({ personalOrgId: userAccount.personalOrgId })
      .from(userAccount)
      .where(eq(userAccount.id, session.user.id))
      .limit(1),
  ]);

  if (!org || !membership) redirect("/dashboard");

  const isPersonalOrg = user?.personalOrgId === orgId;

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center border-b border-border h-12 px-5 bg-background">
        <h1 className="text-sm font-medium text-foreground">Organization settings</h1>
      </header>
      <div className="flex-1 p-5 max-w-2xl">
        <OrgSettingsForm
          org={org}
          myRole={membership.role}
          isPersonalOrg={isPersonalOrg}
          hasOrgKey={!!org.hasKey}
        />
      </div>
    </div>
  );
}
