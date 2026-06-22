import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, isNull, asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { playbook, playbookVersion, playbookCategory, playbookItem } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

const bodySchema = z.object({
  versionId: z.string().uuid(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  // Source playbook must be accessible (own, system, or public)
  const [source] = await db
    .select()
    .from(playbook)
    .where(
      and(
        eq(playbook.id, id),
        or(
          eq(playbook.userId, session!.user.id),
          isNull(playbook.userId),
          eq(playbook.isPublic, true)
        )
      )
    )
    .limit(1);

  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const [sourceVersion] = await db
    .select()
    .from(playbookVersion)
    .where(and(eq(playbookVersion.id, parsed.data.versionId), eq(playbookVersion.playbookId, id)))
    .limit(1);

  if (!sourceVersion) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  // Deep copy: new playbook → new draft version → copy categories + items
  const [newPlaybook] = await db
    .insert(playbook)
    .values({
      userId: session!.user.id,
      name: `${source.name} (copy)`,
      description: source.description,
      isPublic: false,
    })
    .returning();

  const [newVersion] = await db
    .insert(playbookVersion)
    .values({
      playbookId: newPlaybook.id,
      version: "1.0",
      changelog: `Duplicated from "${source.name}" v${sourceVersion.version}.`,
      isActive: true,
      status: "draft",
    })
    .returning();

  const categories = await db
    .select()
    .from(playbookCategory)
    .where(eq(playbookCategory.playbookVersionId, sourceVersion.id))
    .orderBy(asc(playbookCategory.displayOrder));

  for (const cat of categories) {
    const [newCat] = await db
      .insert(playbookCategory)
      .values({
        playbookVersionId: newVersion.id,
        name: cat.name,
        frameworkRef: cat.frameworkRef,
        displayOrder: cat.displayOrder,
      })
      .returning();

    const items = await db
      .select()
      .from(playbookItem)
      .where(eq(playbookItem.categoryId, cat.id))
      .orderBy(asc(playbookItem.displayOrder));

    if (items.length > 0) {
      await db.insert(playbookItem).values(
        items.map((item) => ({
          categoryId: newCat.id,
          name: item.name,
          description: item.description,
          defaultRemediation: item.defaultRemediation,
          defaultRisk: item.defaultRisk,
          active: item.active,
          displayOrder: item.displayOrder,
        }))
      );
    }
  }

  return NextResponse.json(newPlaybook, { status: 201 });
}
