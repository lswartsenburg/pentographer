import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { compare, hash } from "bcryptjs";
import { db } from "@/db/client";
import { userAccount } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

const profileSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(500),
  organizationName: z.string().max(300).nullable().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export async function PATCH(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const bodyObj = body as Record<string, unknown>;

  if ("currentPassword" in bodyObj) {
    // Password change flow
    const parsed = passwordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const [user] = await db
      .select()
      .from(userAccount)
      .where(eq(userAccount.id, session!.user.id))
      .limit(1);

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const valid = await compare(parsed.data.currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 422 });
    }

    const newHash = await hash(parsed.data.newPassword, 12);
    await db
      .update(userAccount)
      .set({ passwordHash: newHash })
      .where(eq(userAccount.id, session!.user.id));

    return NextResponse.json({ success: true });
  }

  // Profile update flow
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  await db
    .update(userAccount)
    .set({
      name: parsed.data.name.trim(),
      email: parsed.data.email.toLowerCase().trim(),
      organizationName: parsed.data.organizationName?.trim() || null,
    })
    .where(eq(userAccount.id, session!.user.id));

  return NextResponse.json({ success: true });
}
