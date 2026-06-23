import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq, desc, and } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { oauthClient } from "@/db/schema";
import { getOrgRole } from "@/lib/org-access";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getOrgRole(session.user.id, session.user.orgId);
  const isAdmin = role === "admin" || role === "owner";

  // Admins see all org clients; members see only their own
  const clients = await db
    .select({
      id: oauthClient.id,
      name: oauthClient.name,
      clientId: oauthClient.clientId,
      createdAt: oauthClient.createdAt,
      lastUsedAt: oauthClient.lastUsedAt,
    })
    .from(oauthClient)
    .where(
      isAdmin
        ? eq(oauthClient.organizationId, session.user.orgId)
        : and(
            eq(oauthClient.organizationId, session.user.orgId),
            eq(oauthClient.userId, session.user.id)
          )
    )
    .orderBy(desc(oauthClient.createdAt));

  return NextResponse.json(clients);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const rawClientId = `ptgc_${crypto.randomBytes(12).toString("hex")}`;
  const rawSecret = `ptgs_${crypto.randomBytes(32).toString("hex")}`;
  const secretHash = crypto.createHash("sha256").update(rawSecret).digest("hex");

  const [client] = await db
    .insert(oauthClient)
    .values({
      organizationId: session.user.orgId,
      userId: session.user.id,
      name,
      clientId: rawClientId,
      clientSecretHash: secretHash,
    })
    .returning({
      id: oauthClient.id,
      name: oauthClient.name,
      clientId: oauthClient.clientId,
      createdAt: oauthClient.createdAt,
    });

  return NextResponse.json({ ...client, clientSecret: rawSecret }, { status: 201 });
}
