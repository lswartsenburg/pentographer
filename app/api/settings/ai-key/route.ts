import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { userAccount } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";

const keySchema = z.object({
  key: z.string().min(1).startsWith("sk-ant-"),
});

export async function PUT(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

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
    .update(userAccount)
    .set({ anthropicApiKey: encrypt(parsed.data.key) })
    .where(eq(userAccount.id, session!.user.id));

  return NextResponse.json({ success: true });
}

export async function DELETE(_request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  await db
    .update(userAccount)
    .set({ anthropicApiKey: null })
    .where(eq(userAccount.id, session!.user.id));

  return new NextResponse(null, { status: 204 });
}
