import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { playbook } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
});

async function getAccessiblePlaybook(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(playbook)
    .where(
      and(
        eq(playbook.id, id),
        or(eq(playbook.userId, userId), isNull(playbook.userId))
      )
    )
    .limit(1);
  return row ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  const row = await getAccessiblePlaybook(session!.user.id, id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(row);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  const [row] = await db
    .select()
    .from(playbook)
    .where(and(eq(playbook.id, id), eq(playbook.userId, session!.user.id)))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const [updated] = await db
    .update(playbook)
    .set({
      ...(parsed.data.name !== undefined && { name: parsed.data.name.trim() }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
    })
    .where(eq(playbook.id, id))
    .returning();

  return NextResponse.json(updated);
}
