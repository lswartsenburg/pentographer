import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, isNull, desc, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { playbook, playbookVersion, playbookCategory, playbookItem } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

const createVersionSchema = z.object({
  changelog: z.string().max(2000).optional().nullable(),
});

function bumpVersion(version: string): string {
  const parts = version.split(".").map(Number);
  if (parts.length === 1) return `${parts[0]}.1`;
  parts[parts.length - 1] += 1;
  return parts.join(".");
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  const [pb] = await db
    .select()
    .from(playbook)
    .where(
      and(eq(playbook.id, id), or(eq(playbook.userId, session!.user.id), isNull(playbook.userId)))
    )
    .limit(1);

  if (!pb) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const versions = await db
    .select()
    .from(playbookVersion)
    .where(eq(playbookVersion.playbookId, id))
    .orderBy(desc(playbookVersion.createdAt));

  return NextResponse.json(versions);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  // Only owner can create new versions
  const [pb] = await db
    .select()
    .from(playbook)
    .where(and(eq(playbook.id, id), eq(playbook.userId, session!.user.id)))
    .limit(1);

  if (!pb) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Enforce: only one draft at a time
  const [existingDraft] = await db
    .select({ id: playbookVersion.id })
    .from(playbookVersion)
    .where(and(eq(playbookVersion.playbookId, id), eq(playbookVersion.status, "draft")))
    .limit(1);

  if (existingDraft)
    return NextResponse.json(
      { error: "A draft already exists. Publish it before creating a new one." },
      { status: 409 }
    );

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = createVersionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Clone from the latest published version (not any draft)
  const [latestVersion] = await db
    .select()
    .from(playbookVersion)
    .where(and(eq(playbookVersion.playbookId, id), ne(playbookVersion.status, "draft")))
    .orderBy(desc(playbookVersion.createdAt))
    .limit(1);

  if (!latestVersion)
    return NextResponse.json({ error: "No published version to clone from" }, { status: 400 });

  const newVersionNumber = bumpVersion(latestVersion.version);

  // Create new version
  const [newVersion] = await db
    .insert(playbookVersion)
    .values({
      playbookId: id,
      version: newVersionNumber,
      changelog: parsed.data.changelog ?? null,
      isActive: true,
    })
    .returning();

  // Deep-clone categories and items from the latest version
  const categories = await db
    .select()
    .from(playbookCategory)
    .where(eq(playbookCategory.playbookVersionId, latestVersion.id));

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

    const items = await db.select().from(playbookItem).where(eq(playbookItem.categoryId, cat.id));

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

  return NextResponse.json(newVersion, { status: 201 });
}
