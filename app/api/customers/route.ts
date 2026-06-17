import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { customer } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  contactEmail: z.string().email().max(255).optional().nullable(),
});

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const rows = await db
    .select()
    .from(customer)
    .where(eq(customer.userId, session!.user.id))
    .orderBy(desc(customer.createdAt));

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const [created] = await db
    .insert(customer)
    .values({
      userId: session!.user.id,
      name: parsed.data.name.trim(),
      contactEmail: parsed.data.contactEmail ?? null,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
