import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, isNull, asc } from "drizzle-orm";
import { db } from "@/db/client";
import { playbook, playbookVersion, playbookCategory, playbookItem } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const userId = session!.user.id;

  const [pb] = await db
    .select()
    .from(playbook)
    .where(
      and(
        eq(playbook.id, id),
        or(eq(playbook.userId, userId), isNull(playbook.userId), eq(playbook.isPublic, true))
      )
    )
    .limit(1);

  if (!pb) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [activeVer] = await db
    .select()
    .from(playbookVersion)
    .where(and(eq(playbookVersion.playbookId, id), eq(playbookVersion.isActive, true)))
    .limit(1);

  if (!activeVer) return NextResponse.json({ error: "No active version" }, { status: 404 });

  const categories = await db
    .select()
    .from(playbookCategory)
    .where(eq(playbookCategory.playbookVersionId, activeVer.id))
    .orderBy(asc(playbookCategory.displayOrder));

  const categoriesWithItems = await Promise.all(
    categories.map(async (cat) => {
      const items = await db
        .select()
        .from(playbookItem)
        .where(eq(playbookItem.categoryId, cat.id))
        .orderBy(asc(playbookItem.displayOrder));

      return {
        name: cat.name,
        frameworkRef: cat.frameworkRef,
        displayOrder: cat.displayOrder,
        items: items.map((item) => ({
          name: item.name,
          description: item.description,
          defaultRemediation: item.defaultRemediation,
          defaultRisk: item.defaultRisk,
          displayOrder: item.displayOrder,
          active: item.active,
        })),
      };
    })
  );

  const exportData = {
    version: "1",
    name: pb.name,
    description: pb.description,
    playbookVersion: activeVer.version,
    changelog: activeVer.changelog,
    categories: categoriesWithItems,
  };

  const slug = pb.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${slug}.json"`,
    },
  });
}
