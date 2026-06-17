import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { playbook, playbookVersion, playbookCategory, playbookItem } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  defaultRemediation: z.string().max(5000).nullable().optional(),
  defaultRisk: z.enum(["high", "medium", "low", "informational"]).optional(),
  active: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
});

async function getOwnedItem(
  userId: string,
  playbookId: string,
  versionId: string,
  categoryId: string,
  itemId: string
) {
  const [pb] = await db
    .select()
    .from(playbook)
    .where(
      and(eq(playbook.id, playbookId), or(eq(playbook.userId, userId), isNull(playbook.userId)))
    )
    .limit(1);
  if (!pb) return null;

  const [version] = await db
    .select()
    .from(playbookVersion)
    .where(and(eq(playbookVersion.id, versionId), eq(playbookVersion.playbookId, playbookId)))
    .limit(1);
  if (!version) return null;

  const [cat] = await db
    .select()
    .from(playbookCategory)
    .where(
      and(eq(playbookCategory.id, categoryId), eq(playbookCategory.playbookVersionId, versionId))
    )
    .limit(1);
  if (!cat) return null;

  const [item] = await db
    .select()
    .from(playbookItem)
    .where(and(eq(playbookItem.id, itemId), eq(playbookItem.categoryId, categoryId)))
    .limit(1);
  return item ?? null;
}

type RouteParams = {
  params: Promise<{ id: string; versionId: string; categoryId: string; itemId: string }>;
};

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id, versionId, categoryId, itemId } = await params;

  const item = await getOwnedItem(session!.user.id, id, versionId, categoryId, itemId);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(item);
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id, versionId, categoryId, itemId } = await params;

  // Must be owner to edit items
  const [pb] = await db
    .select()
    .from(playbook)
    .where(and(eq(playbook.id, id), eq(playbook.userId, session!.user.id)))
    .limit(1);
  if (!pb) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const item = await getOwnedItem(session!.user.id, id, versionId, categoryId, itemId);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name.trim();
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.defaultRemediation !== undefined)
    updateData.defaultRemediation = parsed.data.defaultRemediation;
  if (parsed.data.defaultRisk !== undefined) updateData.defaultRisk = parsed.data.defaultRisk;
  if (parsed.data.active !== undefined) updateData.active = parsed.data.active;
  if (parsed.data.displayOrder !== undefined) updateData.displayOrder = parsed.data.displayOrder;

  const [updated] = await db
    .update(playbookItem)
    .set(updateData)
    .where(eq(playbookItem.id, itemId))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id, versionId, categoryId, itemId } = await params;

  const [pb] = await db
    .select()
    .from(playbook)
    .where(and(eq(playbook.id, id), eq(playbook.userId, session!.user.id)))
    .limit(1);
  if (!pb) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const item = await getOwnedItem(session!.user.id, id, versionId, categoryId, itemId);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(playbookItem).where(eq(playbookItem.id, itemId));

  return NextResponse.json({ success: true });
}
