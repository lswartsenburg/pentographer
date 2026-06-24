import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKey } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { getOrgRole } from "@/lib/org-access";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const role = await getOrgRole(session!.user.id, session!.user.orgId);
  const isAdmin = role === "admin" || role === "owner";

  // Admins can revoke any org key; members can only revoke their own
  const condition = isAdmin
    ? and(eq(apiKey.id, id), eq(apiKey.organizationId, session!.user.orgId))
    : and(
        eq(apiKey.id, id),
        eq(apiKey.organizationId, session!.user.orgId),
        eq(apiKey.userId, session!.user.id)
      );

  const result = await db.delete(apiKey).where(condition).returning({ id: apiKey.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
