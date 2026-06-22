import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, isNull, gt } from "drizzle-orm";
import { jwtVerify } from "jose";
import { db } from "@/db/client";
import { apiKey, oauthClient } from "@/db/schema";

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export async function requireApiKey(
  req: NextRequest
): Promise<{ userId: string; error: null } | { userId: null; error: NextResponse }> {
  const raw = req.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!raw) return { userId: null, error: unauthorized() };

  // ── API key path (ptg_ prefix) ────────────────────────────────────────────
  if (raw.startsWith("ptg_")) {
    const hash = crypto.createHash("sha256").update(raw).digest("hex");
    const [key] = await db
      .select()
      .from(apiKey)
      .where(
        and(
          eq(apiKey.keyHash, hash),
          or(isNull(apiKey.expiresAt), gt(apiKey.expiresAt, new Date()))
        )
      )
      .limit(1);

    if (!key) return { userId: null, error: unauthorized() };
    db.update(apiKey).set({ lastUsedAt: new Date() }).where(eq(apiKey.id, key.id));
    return { userId: key.userId, error: null };
  }

  // ── OAuth JWT path ────────────────────────────────────────────────────────
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) return { userId: null, error: unauthorized() };

  try {
    const { payload } = await jwtVerify(raw, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });

    const userId = payload.sub;
    const clientId = payload.cid as string | undefined;
    if (!userId || !clientId) return { userId: null, error: unauthorized() };

    // Verify the OAuth client still exists and belongs to this user
    const [client] = await db
      .select({ id: oauthClient.id })
      .from(oauthClient)
      .where(and(eq(oauthClient.clientId, clientId), eq(oauthClient.userId, userId)))
      .limit(1);

    if (!client) return { userId: null, error: unauthorized() };

    db.update(oauthClient).set({ lastUsedAt: new Date() }).where(eq(oauthClient.id, client.id));

    return { userId, error: null };
  } catch {
    return { userId: null, error: unauthorized() };
  }
}
