import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { apiKey } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const keys = await db
    .select({
      id: apiKey.id,
      name: apiKey.name,
      createdAt: apiKey.createdAt,
      lastUsedAt: apiKey.lastUsedAt,
      expiresAt: apiKey.expiresAt,
    })
    .from(apiKey)
    .where(eq(apiKey.userId, session!.user.id))
    .orderBy(desc(apiKey.createdAt));

  return NextResponse.json(keys);
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional(),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const rawKey = `ptg_${crypto.randomBytes(32).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  const [created] = await db
    .insert(apiKey)
    .values({
      userId: session!.user.id,
      name: parsed.data.name,
      keyHash,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    })
    .returning({
      id: apiKey.id,
      name: apiKey.name,
      createdAt: apiKey.createdAt,
      expiresAt: apiKey.expiresAt,
    });

  return NextResponse.json({ ...created, key: rawKey }, { status: 201 });
}
