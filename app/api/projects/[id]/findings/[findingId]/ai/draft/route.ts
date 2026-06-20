import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { project, finding, findingVersion, playbookItem, playbookCategory } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";
import { aiErrorMessage } from "@/lib/ai/error";
import type Anthropic from "@anthropic-ai/sdk";

const DRAFT_TOOL: Anthropic.Tool = {
  name: "write_finding",
  description: "Write a professional penetration test finding with description and remediation.",
  input_schema: {
    type: "object" as const,
    required: ["description", "remediation"],
    properties: {
      description: {
        type: "string",
        description:
          "Clear technical description of the vulnerability: what it is, where it was found, how it can be exploited, and the business/security impact. Use markdown formatting. 3-5 paragraphs.",
      },
      remediation: {
        type: "string",
        description:
          "Concrete, actionable remediation steps the development team can follow. Use numbered or bulleted lists. Include code examples where helpful.",
      },
    },
  },
};

async function getOwnedFinding(userId: string, projectId: string, findingId: string) {
  const [proj] = await db
    .select({ id: project.id, name: project.name })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)))
    .limit(1);
  if (!proj) return null;

  const [row] = await db
    .select()
    .from(finding)
    .where(and(eq(finding.id, findingId), eq(finding.projectId, projectId)))
    .limit(1);
  if (!row) return null;

  return { finding: row, projectName: proj.name };
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; findingId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId, findingId } = await params;

  const client = getAnthropicClient();
  if (!client) {
    return NextResponse.json({ error: "AI_NOT_CONFIGURED" }, { status: 503 });
  }

  const result = await getOwnedFinding(session!.user.id, projectId, findingId);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { finding: f, projectName } = result;

  const [latestVersion] = await db
    .select()
    .from(findingVersion)
    .where(eq(findingVersion.findingId, findingId))
    .orderBy(desc(findingVersion.createdAt))
    .limit(1);

  let playbookContext = "";
  if (f.playbookItemId) {
    const [item] = await db
      .select({
        name: playbookItem.name,
        description: playbookItem.description,
        defaultRemediation: playbookItem.defaultRemediation,
        categoryName: playbookCategory.name,
        frameworkRef: playbookCategory.frameworkRef,
      })
      .from(playbookItem)
      .leftJoin(playbookCategory, eq(playbookItem.categoryId, playbookCategory.id))
      .where(eq(playbookItem.id, f.playbookItemId))
      .limit(1);

    if (item) {
      playbookContext = `\nPlaybook item: ${item.name} (${item.categoryName ?? ""}${item.frameworkRef ? ` · ${item.frameworkRef}` : ""})\nPlaybook description: ${item.description ?? "N/A"}\nDefault remediation guidance: ${item.defaultRemediation ?? "N/A"}`;
    }
  }

  try {
    const message = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 2048,
      tools: [DRAFT_TOOL],
      tool_choice: { type: "tool", name: "write_finding" },
      messages: [
        {
          role: "user",
          content: `You are a senior penetration tester writing a professional security audit finding report.

Project: ${projectName}
Finding title: ${f.title}
Risk level: ${f.riskLevel}${playbookContext}

Write a professional security finding suitable for inclusion in a penetration test report.`,
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

    const { description, remediation } = block.input as {
      description: string;
      remediation: string;
    };

    const [newVersion] = await db
      .insert(findingVersion)
      .values({
        findingId,
        title: f.title,
        description: description?.trim() || null,
        remediation: remediation?.trim() || null,
        riskLevel: f.riskLevel,
        cvssScore: latestVersion?.cvssScore ?? null,
        status: latestVersion?.status ?? f.status,
        evidenceUrls: latestVersion?.evidenceUrls ?? [],
        authorType: "ai",
      })
      .returning({ id: findingVersion.id });

    return NextResponse.json({
      description: description?.trim() ?? "",
      remediation: remediation?.trim() ?? "",
      versionId: newVersion.id,
    });
  } catch (err) {
    return NextResponse.json({ error: aiErrorMessage(err) }, { status: 500 });
  }
}
