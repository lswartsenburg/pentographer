import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { organization, organizationMember, userAccount } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

const renameSchema = z.object({
  name: z.string().min(1).max(100),
});

async function getMembership(userId: string, orgId: string) {
  const [row] = await db
    .select({ role: organizationMember.role })
    .from(organizationMember)
    .where(and(eq(organizationMember.userId, userId), eq(organizationMember.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id: orgId } = await params;

  const membership = await getMembership(session!.user.id, orgId);
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
  }
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json(
      { error: "Only owners and admins can rename the organization" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = renameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const [updated] = await db
    .update(organization)
    .set({ name: parsed.data.name.trim() })
    .where(eq(organization.id, orgId))
    .returning({ id: organization.id, name: organization.name });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id: orgId } = await params;

  const membership = await getMembership(session!.user.id, orgId);
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
  }
  if (membership.role !== "owner") {
    return NextResponse.json(
      { error: "Only the owner can delete the organization" },
      { status: 403 }
    );
  }

  // Block deleting any org that is someone's personal org
  const [personalOrgUser] = await db
    .select({ id: userAccount.id })
    .from(userAccount)
    .where(eq(userAccount.personalOrgId, orgId))
    .limit(1);

  if (personalOrgUser) {
    return NextResponse.json(
      { error: "Cannot delete a personal organization. Transfer ownership or contact support." },
      { status: 400 }
    );
  }

  await db.delete(organization).where(eq(organization.id, orgId));

  return new NextResponse(null, { status: 204 });
}
