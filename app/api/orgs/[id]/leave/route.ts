import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { organizationMember, userAccount } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id: orgId } = await params;
  const userId = session!.user.id;

  // Block leaving a personal org
  const [user] = await db
    .select({ personalOrgId: userAccount.personalOrgId })
    .from(userAccount)
    .where(eq(userAccount.id, userId))
    .limit(1);

  if (user?.personalOrgId === orgId) {
    return NextResponse.json({ error: "Cannot leave your personal organization" }, { status: 400 });
  }

  const [membership] = await db
    .select({ id: organizationMember.id, role: organizationMember.role })
    .from(organizationMember)
    .where(and(eq(organizationMember.userId, userId), eq(organizationMember.organizationId, orgId)))
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this organization" }, { status: 404 });
  }

  // Block sole owner from leaving
  if (membership.role === "owner") {
    const owners = await db
      .select({ id: organizationMember.id })
      .from(organizationMember)
      .where(
        and(eq(organizationMember.organizationId, orgId), eq(organizationMember.role, "owner"))
      );

    if (owners.length === 1) {
      return NextResponse.json(
        { error: "You are the sole owner. Transfer ownership before leaving." },
        { status: 400 }
      );
    }
  }

  await db.delete(organizationMember).where(eq(organizationMember.id, membership.id));

  return new NextResponse(null, { status: 204 });
}
