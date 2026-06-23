import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { organizationMember, organization, userAccount } from "@/db/schema";
import { eq } from "drizzle-orm";
import { TeamMembersCard } from "./team-members-card";

export default async function TeamSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const orgId = session.user.orgId;

  const [org] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);

  const members = await db
    .select({
      id: organizationMember.id,
      role: organizationMember.role,
      createdAt: organizationMember.createdAt,
      userId: userAccount.id,
      name: userAccount.name,
      email: userAccount.email,
    })
    .from(organizationMember)
    .innerJoin(userAccount, eq(organizationMember.userId, userAccount.id))
    .where(eq(organizationMember.organizationId, orgId));

  const myMember = members.find((m) => m.userId === session.user.id);
  const myRole = myMember?.role ?? "viewer";

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center border-b border-border h-12 px-5 bg-background">
        <h1 className="text-sm font-medium text-foreground">Team</h1>
      </header>
      <div className="flex-1 p-5 space-y-6">
        <TeamMembersCard
          orgName={org?.name ?? ""}
          members={members}
          myRole={myRole}
          myUserId={session.user.id}
        />
      </div>
    </div>
  );
}
