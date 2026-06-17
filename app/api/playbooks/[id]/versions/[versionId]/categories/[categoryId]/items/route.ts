import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { playbook, playbookVersion, playbookCategory, playbookItem } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  defaultRemediation: z.string().max(5000).optional().nullable(),
  defaultRisk: z.enum(["high", "medium", "low", "informational"]).optional(),
  active: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
});

async function getAccessibleCategory(
  userId: string,
  playbookId: string,
  versionId: string,
  categoryId: string
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
  return cat ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string; categoryId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id, versionId, categoryId } = await params;

  const cat = await getAccessibleCategory(session!.user.id, id, versionId, categoryId);
  if (!cat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const items = await db
    .select()
    .from(playbookItem)
    .where(eq(playbookItem.categoryId, categoryId))
    .orderBy(playbookItem.displayOrder);

  return NextResponse.json(items);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string; categoryId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id, versionId, categoryId } = await params;

  const [pb] = await db
    .select()
    .from(playbook)
    .where(and(eq(playbook.id, id), eq(playbook.userId, session!.user.id)))
    .limit(1);
  if (!pb) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cat = await getAccessibleCategory(session!.user.id, id, versionId, categoryId);
  if (!cat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const [created] = await db
    .insert(playbookItem)
    .values({
      categoryId,
      name: parsed.data.name.trim(),
      description: parsed.data.description ?? null,
      defaultRemediation: parsed.data.defaultRemediation ?? null,
      defaultRisk: parsed.data.defaultRisk ?? "medium",
      active: parsed.data.active ?? true,
      displayOrder: parsed.data.displayOrder ?? 0,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
