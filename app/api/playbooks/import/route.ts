import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { playbook, playbookVersion, playbookCategory, playbookItem } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

const RISK_LEVELS = new Set(["high", "medium", "low", "informational"]);

function validate(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return "Invalid file: expected a JSON object.";
  const d = data as Record<string, unknown>;

  if (d.version !== "1") return "Unsupported format version.";
  if (typeof d.name !== "string" || d.name.trim() === "") return "Missing or empty 'name' field.";
  if (!Array.isArray(d.categories)) return "Missing 'categories' array.";

  for (const [ci, cat] of (d.categories as unknown[]).entries()) {
    if (typeof cat !== "object" || cat === null) return `Category ${ci} is not an object.`;
    const c = cat as Record<string, unknown>;
    if (typeof c.name !== "string" || c.name.trim() === "")
      return `Category ${ci} has a missing or empty 'name'.`;
    if (!Array.isArray(c.items)) return `Category ${ci} is missing 'items' array.`;

    for (const [ii, item] of (c.items as unknown[]).entries()) {
      if (typeof item !== "object" || item === null)
        return `Item ${ii} in category ${ci} is not an object.`;
      const it = item as Record<string, unknown>;
      if (typeof it.name !== "string" || it.name.trim() === "")
        return `Item ${ii} in category '${c.name}' has a missing or empty 'name'.`;
      if (!RISK_LEVELS.has(it.defaultRisk as string))
        return `Item '${it.name}' has invalid 'defaultRisk': must be high, medium, low, or informational.`;
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const userId = session!.user.id;
  const orgId = session!.user.orgId;

  let data: Record<string, unknown>;
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    const text = await file.text();
    data = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Could not parse file as JSON." }, { status: 400 });
  }

  const validationError = validate(data);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  type ItemInput = {
    name: string;
    description?: string | null;
    defaultRemediation?: string | null;
    defaultRisk: "high" | "medium" | "low" | "informational";
    displayOrder?: number;
    active?: boolean;
  };
  type CategoryInput = {
    name: string;
    frameworkRef?: string | null;
    displayOrder?: number;
    items: ItemInput[];
  };

  const categories = data.categories as CategoryInput[];

  const newPlaybook = await db.transaction(async (tx) => {
    const [pb] = await tx
      .insert(playbook)
      .values({
        userId,
        organizationId: orgId,
        name: (data.name as string).trim(),
        description: typeof data.description === "string" ? data.description : null,
        isPublic: false,
      })
      .returning();

    const [ver] = await tx
      .insert(playbookVersion)
      .values({
        playbookId: pb.id,
        version: typeof data.playbookVersion === "string" ? data.playbookVersion : "1.0",
        changelog: typeof data.changelog === "string" ? data.changelog : null,
        isActive: true,
        status: "published",
      })
      .returning();

    for (const [ci, cat] of categories.entries()) {
      const [newCat] = await tx
        .insert(playbookCategory)
        .values({
          playbookVersionId: ver.id,
          name: cat.name.trim(),
          frameworkRef: cat.frameworkRef ?? null,
          displayOrder: cat.displayOrder ?? ci,
        })
        .returning();

      for (const [ii, item] of cat.items.entries()) {
        await tx.insert(playbookItem).values({
          categoryId: newCat.id,
          name: item.name.trim(),
          description: item.description ?? null,
          defaultRemediation: item.defaultRemediation ?? null,
          defaultRisk: item.defaultRisk,
          active: item.active ?? true,
          displayOrder: item.displayOrder ?? ii,
        });
      }
    }

    return pb;
  });

  return NextResponse.json({ id: newPlaybook.id }, { status: 201 });
}
