import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { organization, organizationMember } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";

const keySchema = z.object({
  key: z.string().min(1).startsWith("sk-ant-"),
});

async function getMembership(userId: string, orgId: string) {
  const [row] = await db
    .select({ role: organizationMember.role })
    .from(organizationMember)
    .where(and(eq(organizationMember.userId, userId), eq(organizationMember.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id: orgId } = await params;
  const membership = await getMembership(session!.user.id, orgId);
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
  }
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json(
      { error: "Only owners and admins can set an API key" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = keySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid API key format" }, { status: 400 });
  }

  await db
    .update(organization)
    .set({ anthropicApiKey: encrypt(parsed.data.key) })
    .where(eq(organization.id, orgId));

  return NextResponse.json({ success: true });
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
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json(
      { error: "Only owners and admins can remove an API key" },
      { status: 403 }
    );
  }

  await db.update(organization).set({ anthropicApiKey: null }).where(eq(organization.id, orgId));

  return new NextResponse(null, { status: 204 });
}
