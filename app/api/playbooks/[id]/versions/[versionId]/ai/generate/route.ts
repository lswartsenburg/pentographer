import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { playbook, playbookVersion, playbookCategory, playbookItem } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";

const generateSchema = z.object({
  appDescription: z.string().min(10).max(2000),
});

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

  // Only playbook owner can generate
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

  // Clear existing categories (cascade deletes items via FK) before generating
  await db.delete(playbookCategory).where(eq(playbookCategory.playbookVersionId, versionId));

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

  const prompt = `You are a senior penetration tester creating a security testing playbook.

Application description:
${parsed.data.appDescription}

Generate a comprehensive security testing playbook for this application type. Respond with a JSON object:

{
  "categories": [
    {
      "name": "Category name (e.g. Authentication)",
      "frameworkRef": "Optional framework reference (e.g. A07:2021) or null",
      "items": [
        {
          "name": "Short issue name (e.g. Brute Force)",
          "description": "What to look for and how to test for it. 2-4 sentences.",
          "defaultRemediation": "How to fix this. 2-4 sentences.",
          "defaultRisk": "high | medium | low | informational"
        }
      ]
    }
  ]
}

Requirements:
- Generate 4-8 categories relevant to the application type
- Each category should have 3-6 items
- Be specific to the application description, not just generic web security
- Map to OWASP Top 10 2021 where applicable (use A01:2021 format for frameworkRef)
- defaultRisk must be exactly one of: high, medium, low, informational

Respond with ONLY the JSON object. No preamble.`;

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
          defaultRisk: "high" | "medium" | "low" | "informational";
        }>;
      }>;
    };

    try {
      generated = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    // Insert all categories and items in a transaction
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

        const validRisks = new Set(["high", "medium", "low", "informational"]);
        for (let itemIdx = 0; itemIdx < (cat.items ?? []).length; itemIdx++) {
          const item = cat.items[itemIdx];
          const defaultRisk = validRisks.has(item.defaultRisk) ? item.defaultRisk : "medium";
          await tx.insert(playbookItem).values({
            categoryId: newCat.id,
            name: item.name.trim(),
            description: item.description?.trim() ?? null,
            defaultRemediation: item.defaultRemediation?.trim() ?? null,
            defaultRisk: defaultRisk as "high" | "medium" | "low" | "informational",
            active: true,
            displayOrder: itemIdx,
          });
          totalItems++;
        }
      }
    });

    return NextResponse.json({ created: { categories: totalCategories, items: totalItems } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
