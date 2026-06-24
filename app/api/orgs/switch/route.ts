import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { organizationMember } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

const bodySchema = z.object({
  orgId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid orgId" }, { status: 400 });
  }

  const { orgId } = parsed.data;

  const [membership] = await db
    .select({ id: organizationMember.id })
    .from(organizationMember)
    .where(
      and(
        eq(organizationMember.userId, session!.user.id),
        eq(organizationMember.organizationId, orgId)
      )
    )
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
  }

  return NextResponse.json({ orgId });
}
