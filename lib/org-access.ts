import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { organizationMember } from "@/db/schema";

export type OrgRole = "owner" | "admin" | "member" | "viewer";

const ROLE_ORDER: OrgRole[] = ["viewer", "member", "admin", "owner"];

function roleRank(role: OrgRole): number {
  return ROLE_ORDER.indexOf(role);
}

export async function getOrgRole(userId: string, orgId: string): Promise<OrgRole | null> {
  const [row] = await db
    .select({ role: organizationMember.role })
    .from(organizationMember)
    .where(and(eq(organizationMember.userId, userId), eq(organizationMember.organizationId, orgId)))
    .limit(1);
  return row?.role ?? null;
}

/** Returns true if the user is a member of orgId with at least `minimum` role. */
export async function requireOrgRole(
  userId: string,
  orgId: string,
  minimum: OrgRole = "viewer"
): Promise<boolean> {
  const role = await getOrgRole(userId, orgId);
  if (!role) return false;
  return roleRank(role) >= roleRank(minimum);
}
