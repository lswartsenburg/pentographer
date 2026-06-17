import { NextRequest, NextResponse } from "next/server";
import { eq, and, asc, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { project, playbookVersion, playbookCategory, playbookItem } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId } = await params;

  const [proj] = await db
    .select({ playbookVersionId: project.playbookVersionId })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, session!.user.id)))
    .limit(1);

  if (!proj) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!proj.playbookVersionId) return NextResponse.json([]);

  const categories = await db
    .select()
    .from(playbookCategory)
    .where(eq(playbookCategory.playbookVersionId, proj.playbookVersionId))
    .orderBy(asc(playbookCategory.displayOrder));

  const categoryIds = categories.map((c) => c.id);
  if (categoryIds.length === 0) return NextResponse.json([]);

  const items = await db
    .select()
    .from(playbookItem)
    .where(inArray(playbookItem.categoryId, categoryIds))
    .orderBy(asc(playbookItem.displayOrder));

  const result = items
    .filter((item) => item.active)
    .map((item) => {
      const cat = categories.find((c) => c.id === item.categoryId);
      return {
        id: item.id,
        name: item.name,
        categoryId: item.categoryId,
        categoryName: cat?.name ?? "",
        defaultRisk: item.defaultRisk,
        description: item.description,
        defaultRemediation: item.defaultRemediation,
      };
    });

  return NextResponse.json(result);
}
