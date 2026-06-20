import { NextRequest, NextResponse } from "next/server";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@/db/client";
import { project, finding, playbookVersion, playbookCategory, playbookItem } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";
import { aiErrorMessage } from "@/lib/ai/error";
import type Anthropic from "@anthropic-ai/sdk";

const SUGGEST_TOOL: Anthropic.Tool = {
  name: "suggest_items",
  description: "Suggest uncovered playbook items worth investigating based on existing findings.",
  input_schema: {
    type: "object" as const,
    required: ["suggestions"],
    properties: {
      suggestions: {
        type: "array",
        description: "Up to 5 suggested playbook items, ordered by relevance.",
        maxItems: 5,
        items: {
          type: "object",
          required: ["itemId", "name", "categoryName", "reason"],
          properties: {
            itemId: { type: "string", description: "Exact ID from the uncovered items list" },
            name: { type: "string" },
            categoryName: { type: "string" },
            reason: {
              type: "string",
              description:
                "1-sentence reason why this item is likely worth investigating given the existing findings",
            },
          },
        },
      },
    },
  },
};

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId } = await params;

  const client = getAnthropicClient();
  if (!client) {
    return NextResponse.json({ error: "AI_NOT_CONFIGURED" }, { status: 503 });
  }

  const [proj] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, session!.user.id)))
    .limit(1);
  if (!proj) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const findings = await db
    .select({
      title: finding.title,
      playbookItemId: finding.playbookItemId,
      riskLevel: finding.riskLevel,
    })
    .from(finding)
    .where(eq(finding.projectId, projectId));

  const linkedItemIds = new Set(findings.map((f) => f.playbookItemId).filter(Boolean));

  if (!proj.playbookVersionId) {
    return NextResponse.json({ error: "No playbook linked to this project" }, { status: 400 });
  }

  const categories = await db
    .select()
    .from(playbookCategory)
    .where(eq(playbookCategory.playbookVersionId, proj.playbookVersionId))
    .orderBy(asc(playbookCategory.displayOrder));

  const categoriesWithItems = await Promise.all(
    categories.map(async (cat) => {
      const items = await db
        .select()
        .from(playbookItem)
        .where(and(eq(playbookItem.categoryId, cat.id), eq(playbookItem.active, true)))
        .orderBy(asc(playbookItem.displayOrder));
      return { ...cat, items };
    })
  );

  const uncoveredItems = categoriesWithItems.flatMap((cat) =>
    cat.items
      .filter((item) => !linkedItemIds.has(item.id))
      .map((item) => ({
        itemId: item.id,
        name: item.name,
        categoryName: cat.name,
        defaultRisk: item.defaultRisk,
        description: item.description,
      }))
  );

  if (uncoveredItems.length === 0) {
    return NextResponse.json([]);
  }

  const findingsSummary =
    findings.length > 0
      ? findings.map((f) => `- ${f.title} (${f.riskLevel})`).join("\n")
      : "No findings yet.";

  const uncoveredSummary = uncoveredItems
    .map(
      (i) =>
        `[${i.itemId}] ${i.categoryName} > ${i.name} (${i.defaultRisk}): ${i.description ?? "N/A"}`
    )
    .join("\n");

  try {
    const message = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      tools: [SUGGEST_TOOL],
      tool_choice: { type: "tool", name: "suggest_items" },
      messages: [
        {
          role: "user",
          content: `You are a security assessment advisor. A penetration tester has documented the following findings:

${findingsSummary}

The following playbook items have NOT yet been covered (not linked to any finding):

${uncoveredSummary}

Based on the existing findings and common co-occurrence patterns in web application security assessments, suggest up to 5 of the uncovered items that are most likely to also be present or worth investigating. Only suggest items from the list above — use the exact itemId values shown in brackets.`,
        },
      ],
    });

    const block = message.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      return NextResponse.json(
        { error: "AI returned an unexpected response format. Please try again." },
        { status: 500 }
      );
    }

    const { suggestions } = block.input as {
      suggestions: Array<{ itemId: string; name: string; categoryName: string; reason: string }>;
    };

    // Validate that returned itemIds are actually in the uncovered list
    const validIds = new Set(uncoveredItems.map((i) => i.itemId));
    const validated = (suggestions ?? []).filter((s) => validIds.has(s.itemId)).slice(0, 5);

    return NextResponse.json(validated);
  } catch (err) {
    return NextResponse.json({ error: aiErrorMessage(err) }, { status: 500 });
  }
}
