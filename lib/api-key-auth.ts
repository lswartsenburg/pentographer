import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, isNull, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKey } from "@/db/schema";

export async function requireApiKey(
  req: NextRequest
): Promise<{ userId: string; error: null } | { userId: null; error: NextResponse }> {
  const raw = req.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!raw) {
    return { userId: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const hash = crypto.createHash("sha256").update(raw).digest("hex");

  const [key] = await db
    .select()
    .from(apiKey)
    .where(
      and(eq(apiKey.keyHash, hash), or(isNull(apiKey.expiresAt), gt(apiKey.expiresAt, new Date())))
    )
    .limit(1);

  if (!key) {
    return { userId: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  // fire-and-forget — don't await to keep latency low
  db.update(apiKey).set({ lastUsedAt: new Date() }).where(eq(apiKey.id, key.id));

  return { userId: key.userId, error: null };
}
