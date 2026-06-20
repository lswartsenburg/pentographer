import { NextRequest, NextResponse } from "next/server";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@/db/client";
import { project, finding, playbookVersion, playbookCategory, playbookItem } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";
import { aiErrorMessage } from "@/lib/ai/error";

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

  // Load existing findings
  const findings = await db
    .select({
      title: finding.title,
      playbookItemId: finding.playbookItemId,
      riskLevel: finding.riskLevel,
    })
    .from(finding)
    .where(eq(finding.projectId, projectId));

  const linkedItemIds = new Set(findings.map((f) => f.playbookItemId).filter(Boolean));

  // Load playbook items tree (via pinned playbookVersionId)
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

  const prompt = `You are a security assessment advisor. A penetration tester has documented the following findings:

${findingsSummary}

The following playbook items have NOT yet been covered (not linked to any finding):

${uncoveredSummary}

Based on the existing findings and common co-occurrence patterns in web application security assessments, suggest up to 5 of the uncovered items that are most likely to also be present or worth investigating.

Respond with a JSON array of up to 5 objects, each with:
- "itemId": the exact ID from the list above (string in brackets)
- "name": the item name
- "categoryName": the category name
- "reason": a 1-sentence reason why this item is likely worth investigating given the existing findings

Respond with ONLY the JSON array. No preamble.`;

  try {
    const message = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content[0]?.type === "text" ? message.content[0].text : "[]";
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    const cleaned = start !== -1 && end > start ? raw.slice(start, end + 1) : raw.trim();

    let suggestions: Array<{ itemId: string; name: string; categoryName: string; reason: string }>;
    try {
      suggestions = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "AI returned an unexpected response format. Please try again." },
        { status: 500 }
      );
    }

    // Validate that returned itemIds are actually in the uncovered list
    const validIds = new Set(uncoveredItems.map((i) => i.itemId));
    const validated = suggestions.filter((s) => validIds.has(s.itemId)).slice(0, 5);

    return NextResponse.json(validated);
  } catch (err) {
    return NextResponse.json({ error: aiErrorMessage(err) }, { status: 500 });
  }
}
