import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { SignJWT } from "jose";
import { db } from "@/db/client";
import { oauthClient } from "@/db/schema";

const TOKEN_TTL = 3600; // 1 hour

export async function POST(req: NextRequest) {
  // Accept both application/x-www-form-urlencoded and application/json
  let grantType: string | null = null;
  let clientId: string | null = null;
  let clientSecret: string | null = null;

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const body = await req.formData();
    grantType = body.get("grant_type") as string | null;
    clientId = body.get("client_id") as string | null;
    clientSecret = body.get("client_secret") as string | null;
  } else {
    const body = await req.json().catch(() => ({}));
    grantType = body.grant_type ?? null;
    clientId = body.client_id ?? null;
    clientSecret = body.client_secret ?? null;
  }

  if (grantType !== "client_credentials") {
    return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
  }

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "client_id and client_secret are required" },
      { status: 400 }
    );
  }

  const secretHash = crypto.createHash("sha256").update(clientSecret).digest("hex");

  const [client] = await db
    .select()
    .from(oauthClient)
    .where(and(eq(oauthClient.clientId, clientId), eq(oauthClient.clientSecretHash, secretHash)))
    .limit(1);

  if (!client) {
    return NextResponse.json({ error: "invalid_client" }, { status: 401 });
  }

  const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!authSecret) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const now = Math.floor(Date.now() / 1000);
  const accessToken = await new SignJWT({ cid: client.clientId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(client.userId)
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_TTL)
    .sign(new TextEncoder().encode(authSecret));

  // fire-and-forget
  db.update(oauthClient).set({ lastUsedAt: new Date() }).where(eq(oauthClient.id, client.id));

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: TOKEN_TTL,
  });
}
