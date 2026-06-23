import { NextRequest, NextResponse } from "next/server";
import { eq, and, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { organizationMember } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { getOrgRole, requireOrgRole } from "@/lib/org-access";

const patchSchema = z.object({
  role: z.enum(["admin", "member", "viewer"]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { memberId } = await params;

  if (!(await requireOrgRole(session!.user.id, session!.user.orgId, "admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [target] = await db
    .select()
    .from(organizationMember)
    .where(
      and(
        eq(organizationMember.id, memberId),
        eq(organizationMember.organizationId, session!.user.orgId)
      )
    )
    .limit(1);

  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // Cannot change an owner's role unless you're an owner yourself
  if (target.role === "owner") {
    const myRole = await getOrgRole(session!.user.id, session!.user.orgId);
    if (myRole !== "owner") {
      return NextResponse.json(
        { error: "Only owners can change another owner's role" },
        { status: 403 }
      );
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Cannot assign owner role via this endpoint (use a dedicated transfer-ownership flow)
  if (parsed.data.role === ("owner" as string)) {
    return NextResponse.json({ error: "Cannot assign owner role directly" }, { status: 400 });
  }

  const [updated] = await db
    .update(organizationMember)
    .set({ role: parsed.data.role })
    .where(eq(organizationMember.id, memberId))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { memberId } = await params;

  if (!(await requireOrgRole(session!.user.id, session!.user.orgId, "admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [target] = await db
    .select()
    .from(organizationMember)
    .where(
      and(
        eq(organizationMember.id, memberId),
        eq(organizationMember.organizationId, session!.user.orgId)
      )
    )
    .limit(1);

  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // Prevent removing the last owner
  if (target.role === "owner") {
    const [otherOwner] = await db
      .select({ id: organizationMember.id })
      .from(organizationMember)
      .where(
        and(
          eq(organizationMember.organizationId, session!.user.orgId),
          eq(organizationMember.role, "owner"),
          ne(organizationMember.id, memberId)
        )
      )
      .limit(1);

    if (!otherOwner) {
      return NextResponse.json({ error: "Cannot remove the sole owner" }, { status: 400 });
    }
  }

  await db.delete(organizationMember).where(eq(organizationMember.id, memberId));

  return NextResponse.json({ success: true });
}
