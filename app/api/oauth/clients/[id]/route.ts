import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { oauthClient } from "@/db/schema";
import { getOrgRole } from "@/lib/org-access";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const role = await getOrgRole(session.user.id, session.user.orgId);
  const isAdmin = role === "admin" || role === "owner";

  // Admins can revoke any org client; members can only revoke their own
  const condition = isAdmin
    ? and(eq(oauthClient.id, id), eq(oauthClient.organizationId, session.user.orgId))
    : and(
        eq(oauthClient.id, id),
        eq(oauthClient.organizationId, session.user.orgId),
        eq(oauthClient.userId, session.user.id)
      );

  const result = await db.delete(oauthClient).where(condition).returning({ id: oauthClient.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
