import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { organizationMember, userAccount } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { requireOrgRole } from "@/lib/org-access";

const addMemberSchema = z.object({
  email: z.string().email().max(255),
  role: z.enum(["admin", "member", "viewer"]).default("member"),
});

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const rows = await db
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
    .where(eq(organizationMember.organizationId, session!.user.orgId));

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  if (!(await requireOrgRole(session!.user.id, session!.user.orgId, "admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = addMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const [targetUser] = await db
    .select({ id: userAccount.id })
    .from(userAccount)
    .where(eq(userAccount.email, parsed.data.email.toLowerCase()))
    .limit(1);

  if (!targetUser) {
    return NextResponse.json({ error: "No account found with that email" }, { status: 404 });
  }

  const [existing] = await db
    .select({ id: organizationMember.id })
    .from(organizationMember)
    .where(
      and(
        eq(organizationMember.organizationId, session!.user.orgId),
        eq(organizationMember.userId, targetUser.id)
      )
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "User is already a member" }, { status: 409 });
  }

  const [created] = await db
    .insert(organizationMember)
    .values({
      organizationId: session!.user.orgId,
      userId: targetUser.id,
      role: parsed.data.role,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
