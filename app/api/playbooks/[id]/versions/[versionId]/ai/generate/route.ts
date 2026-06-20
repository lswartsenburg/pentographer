import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { playbook, playbookVersion, playbookCategory, playbookItem } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";

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

  const existingJson = hasExisting
    ? JSON.stringify(
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
      )
    : null;

  const prompt = hasExisting
    ? `You are a senior penetration tester updating a security testing playbook.

Current playbook content:
${existingJson}

User instruction:
${instruction}

Update the playbook based on the instruction. You may add new categories or items, modify existing ones, or remove items that are no longer relevant (by omitting them). Reproduce unchanged items verbatim.

Respond with the complete updated playbook as a JSON object:

{
  "categories": [
    {
      "name": "Category name",
      "frameworkRef": "OWASP ref like A07:2021, or null",
      "items": [
        {
          "name": "Short issue name",
          "description": "What to look for and how to test. 2-4 sentences.",
          "defaultRemediation": "How to fix this. 2-4 sentences.",
          "defaultRisk": "high | medium | low | informational"
        }
      ]
    }
  ]
}

Requirements:
- defaultRisk must be exactly one of: high, medium, low, informational
- Respond with ONLY the JSON object. No preamble.`
    : `You are a senior penetration tester creating a security testing playbook.

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
          defaultRisk: "high" | "medium" | "low" | "informational";
        }>;
      }>;
    };

    try {
      generated = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    // Replace all categories for this version
    await db.delete(playbookCategory).where(eq(playbookCategory.playbookVersionId, versionId));

    let totalCategories = 0;
    let totalItems = 0;
    const validRisks = new Set(["high", "medium", "low", "informational"]);

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
