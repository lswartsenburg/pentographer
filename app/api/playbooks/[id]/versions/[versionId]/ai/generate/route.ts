import { NextRequest, NextResponse } from "next/server";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { playbook, playbookVersion, playbookCategory, playbookItem } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";
import { aiErrorMessage } from "@/lib/ai/error";

const existingItemSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  defaultRemediation: z.string().nullable().optional(),
  defaultRisk: z.enum(["high", "medium", "low", "informational"]),
});

const existingCategorySchema = z.object({
  name: z.string(),
  frameworkRef: z.string().nullable().optional(),
  items: z.array(existingItemSchema),
});

const generateSchema = z.object({
  instruction: z.string().min(1).max(2000),
  existingContent: z.array(existingCategorySchema).optional(),
});

const VALID_RISKS = new Set(["high", "medium", "low", "informational"]);
function safeRisk(r: unknown) {
  return typeof r === "string" && VALID_RISKS.has(r)
    ? (r as "high" | "medium" | "low" | "informational")
    : "medium";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: playbookId, versionId } = await params;

  const client = getAnthropicClient();
  if (!client) {
    return NextResponse.json({ error: "AI_NOT_CONFIGURED" }, { status: 503 });
  }

  const [pb] = await db
    .select()
    .from(playbook)
    .where(and(eq(playbook.id, playbookId), eq(playbook.userId, session!.user.id)))
    .limit(1);
  if (!pb) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [version] = await db
    .select()
    .from(playbookVersion)
    .where(and(eq(playbookVersion.id, versionId), eq(playbookVersion.playbookId, playbookId)))
    .limit(1);
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (version.status !== "draft") {
    return NextResponse.json({ error: "Can only generate into a draft version" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { instruction, existingContent } = parsed.data;
  const hasExisting = existingContent && existingContent.length > 0;

  // ── UPDATE MODE: patch-based (only return changes) ──────────────────────
  if (hasExisting) {
    const existingJson = JSON.stringify(
      existingContent!.map((cat) => ({
        name: cat.name,
        frameworkRef: cat.frameworkRef ?? null,
        items: cat.items.map((i) => ({
          name: i.name,
          description: i.description ?? null,
          defaultRemediation: i.defaultRemediation ?? null,
          defaultRisk: i.defaultRisk,
        })),
      })),
      null,
      2
    );

    const prompt = `You are a senior penetration tester updating a security testing playbook.

Current playbook content:
${existingJson}

User instruction:
${instruction}

Return ONLY the changes — do NOT reproduce the full playbook. Use this JSON format:

{
  "modifyItems": [
    {
      "categoryName": "exact category name",
      "itemName": "exact item name",
      "description": "new value or omit if unchanged",
      "defaultRemediation": "new value or omit if unchanged",
      "defaultRisk": "high|medium|low|informational or omit if unchanged"
    }
  ],
  "addItems": [
    {
      "categoryName": "exact category name",
      "name": "new item name",
      "description": "...",
      "defaultRemediation": "...",
      "defaultRisk": "high|medium|low|informational"
    }
  ],
  "removeItems": [
    { "categoryName": "exact category name", "itemName": "exact item name" }
  ],
  "addCategories": [
    {
      "name": "new category name",
      "frameworkRef": "A07:2021 or null",
      "items": [{ "name": "...", "description": "...", "defaultRemediation": "...", "defaultRisk": "high|medium|low|informational" }]
    }
  ],
  "removeCategories": ["exact category name"]
}

Rules:
- Only include arrays that are non-empty. Omit empty ones.
- categoryName and itemName must match the existing content exactly (case-sensitive).
- For modifyItems, include only the fields that actually change.
- defaultRisk must be exactly one of: high, medium, low, informational.
- Respond with ONLY the JSON object. No preamble.`;

    try {
      const message = await client.messages.create({
        model: AI_MODEL,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });

      const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      const cleaned = start !== -1 && end > start ? raw.slice(start, end + 1) : raw.trim();

      let patch: {
        modifyItems?: Array<{
          categoryName: string;
          itemName: string;
          description?: string;
          defaultRemediation?: string;
          defaultRisk?: string;
        }>;
        addItems?: Array<{
          categoryName: string;
          name: string;
          description?: string;
          defaultRemediation?: string;
          defaultRisk?: string;
        }>;
        removeItems?: Array<{ categoryName: string; itemName: string }>;
        addCategories?: Array<{
          name: string;
          frameworkRef?: string | null;
          items?: Array<{
            name: string;
            description?: string;
            defaultRemediation?: string;
            defaultRisk?: string;
          }>;
        }>;
        removeCategories?: string[];
      };

      try {
        patch = JSON.parse(cleaned);
      } catch {
        return NextResponse.json(
          { error: "AI returned an unexpected response format. Please try again." },
          { status: 500 }
        );
      }

      // Load current DB state (need IDs for targeted updates)
      const dbCategories = await db
        .select()
        .from(playbookCategory)
        .where(eq(playbookCategory.playbookVersionId, versionId))
        .orderBy(asc(playbookCategory.displayOrder));

      const dbCatByName = new Map(dbCategories.map((c) => [c.name, c]));

      const dbItemsByCategoryId = new Map<
        string,
        { id: string; name: string; displayOrder: number }[]
      >();
      for (const cat of dbCategories) {
        const items = await db
          .select({
            id: playbookItem.id,
            name: playbookItem.name,
            displayOrder: playbookItem.displayOrder,
          })
          .from(playbookItem)
          .where(eq(playbookItem.categoryId, cat.id))
          .orderBy(asc(playbookItem.displayOrder));
        dbItemsByCategoryId.set(cat.id, items);
      }

      let modified = 0;
      let added = 0;
      let removed = 0;

      await db.transaction(async (tx) => {
        // ── modifyItems ──────────────────────────────────────────────────────
        for (const change of patch.modifyItems ?? []) {
          const cat = dbCatByName.get(change.categoryName);
          if (!cat) continue;
          const items = dbItemsByCategoryId.get(cat.id) ?? [];
          const item = items.find((i) => i.name === change.itemName);
          if (!item) continue;
          const updates: Partial<{
            description: string | null;
            defaultRemediation: string | null;
            defaultRisk: "high" | "medium" | "low" | "informational";
          }> = {};
          if (change.description !== undefined) updates.description = change.description.trim();
          if (change.defaultRemediation !== undefined)
            updates.defaultRemediation = change.defaultRemediation.trim();
          if (change.defaultRisk !== undefined) updates.defaultRisk = safeRisk(change.defaultRisk);
          if (Object.keys(updates).length > 0) {
            await tx.update(playbookItem).set(updates).where(eq(playbookItem.id, item.id));
            modified++;
          }
        }

        // ── addItems ─────────────────────────────────────────────────────────
        for (const change of patch.addItems ?? []) {
          const cat = dbCatByName.get(change.categoryName);
          if (!cat) continue;
          const items = dbItemsByCategoryId.get(cat.id) ?? [];
          const nextOrder =
            items.length > 0 ? Math.max(...items.map((i) => i.displayOrder)) + 1 : 0;
          await tx.insert(playbookItem).values({
            categoryId: cat.id,
            name: change.name.trim(),
            description: change.description?.trim() ?? null,
            defaultRemediation: change.defaultRemediation?.trim() ?? null,
            defaultRisk: safeRisk(change.defaultRisk),
            active: true,
            displayOrder: nextOrder,
          });
          added++;
        }

        // ── removeItems ───────────────────────────────────────────────────────
        for (const change of patch.removeItems ?? []) {
          const cat = dbCatByName.get(change.categoryName);
          if (!cat) continue;
          const items = dbItemsByCategoryId.get(cat.id) ?? [];
          const item = items.find((i) => i.name === change.itemName);
          if (!item) continue;
          await tx.delete(playbookItem).where(eq(playbookItem.id, item.id));
          removed++;
        }

        // ── addCategories ────────────────────────────────────────────────────
        for (const newCat of patch.addCategories ?? []) {
          const nextOrder =
            dbCategories.length > 0 ? Math.max(...dbCategories.map((c) => c.displayOrder)) + 1 : 0;
          const [inserted] = await tx
            .insert(playbookCategory)
            .values({
              playbookVersionId: versionId,
              name: newCat.name.trim(),
              frameworkRef: newCat.frameworkRef ?? null,
              displayOrder: nextOrder,
            })
            .returning({ id: playbookCategory.id });
          added++;

          for (let idx = 0; idx < (newCat.items ?? []).length; idx++) {
            const item = newCat.items![idx];
            await tx.insert(playbookItem).values({
              categoryId: inserted.id,
              name: item.name.trim(),
              description: item.description?.trim() ?? null,
              defaultRemediation: item.defaultRemediation?.trim() ?? null,
              defaultRisk: safeRisk(item.defaultRisk),
              active: true,
              displayOrder: idx,
            });
            added++;
          }
        }

        // ── removeCategories ─────────────────────────────────────────────────
        for (const catName of patch.removeCategories ?? []) {
          const cat = dbCatByName.get(catName);
          if (!cat) continue;
          await tx.delete(playbookItem).where(eq(playbookItem.categoryId, cat.id));
          await tx.delete(playbookCategory).where(eq(playbookCategory.id, cat.id));
          removed++;
        }
      });

      return NextResponse.json({ patch, counts: { modified, added, removed } });
    } catch (err) {
      return NextResponse.json({ error: aiErrorMessage(err) }, { status: 500 });
    }
  }

  // ── GENERATE MODE: full generation from scratch ──────────────────────────
  const prompt = `You are a senior penetration tester creating a security testing playbook.

${instruction}

Generate a comprehensive security testing playbook for this application. Respond with a JSON object:

{
  "categories": [
    {
      "name": "Category name (e.g. Authentication)",
      "frameworkRef": "OWASP ref like A07:2021, or null",
      "items": [
        {
          "name": "Short issue name (e.g. Brute Force)",
          "description": "What to look for and how to test. 2-4 sentences.",
          "defaultRemediation": "How to fix this. 2-4 sentences.",
          "defaultRisk": "high | medium | low | informational"
        }
      ]
    }
  ]
}

Requirements:
- Generate 4-8 categories relevant to the application
- Each category should have 3-6 items
- Map to OWASP Top 10 2021 where applicable (use A01:2021 format for frameworkRef)
- defaultRisk must be exactly one of: high, medium, low, informational
- Respond with ONLY the JSON object. No preamble.`;

  try {
    const message = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const cleaned = start !== -1 && end > start ? raw.slice(start, end + 1) : raw.trim();

    let generated: {
      categories: Array<{
        name: string;
        frameworkRef?: string | null;
        items: Array<{
          name: string;
          description: string;
          defaultRemediation: string;
          defaultRisk: string;
        }>;
      }>;
    };

    try {
      generated = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "AI returned an unexpected response format. Please try again." },
        { status: 500 }
      );
    }

    await db.delete(playbookCategory).where(eq(playbookCategory.playbookVersionId, versionId));

    let totalCategories = 0;
    let totalItems = 0;

    await db.transaction(async (tx) => {
      for (let catIdx = 0; catIdx < generated.categories.length; catIdx++) {
        const cat = generated.categories[catIdx];
        const [newCat] = await tx
          .insert(playbookCategory)
          .values({
            playbookVersionId: versionId,
            name: cat.name.trim(),
            frameworkRef: cat.frameworkRef ?? null,
            displayOrder: catIdx,
          })
          .returning({ id: playbookCategory.id });
        totalCategories++;

        for (let itemIdx = 0; itemIdx < (cat.items ?? []).length; itemIdx++) {
          const item = cat.items[itemIdx];
          await tx.insert(playbookItem).values({
            categoryId: newCat.id,
            name: item.name.trim(),
            description: item.description?.trim() ?? null,
            defaultRemediation: item.defaultRemediation?.trim() ?? null,
            defaultRisk: safeRisk(item.defaultRisk),
            active: true,
            displayOrder: itemIdx,
          });
          totalItems++;
        }
      }
    });

    return NextResponse.json({ created: { categories: totalCategories, items: totalItems } });
  } catch (err) {
    return NextResponse.json({ error: aiErrorMessage(err) }, { status: 500 });
  }
}
