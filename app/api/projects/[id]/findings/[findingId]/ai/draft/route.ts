import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { project, finding, findingVersion, playbookItem, playbookCategory } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";
import { aiErrorMessage } from "@/lib/ai/error";
import { makeSSE } from "@/lib/ai/sse";
import type Anthropic from "@anthropic-ai/sdk";
import { getStorage } from "@/lib/storage";

export const maxDuration = 120;

const evidenceItemSchema = z.object({ key: z.string(), url: z.string() });

const bodySchema = z.object({
  instruction: z.string().max(2000).optional(),
  notes: z.string().max(10000).optional(),
  evidenceUrls: z.array(evidenceItemSchema).max(10).optional(),
});

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
          "Clear technical description of the vulnerability: what it is, where it was found, how it can be exploited, and the business/security impact. Use markdown formatting. 3-5 paragraphs. If evidence images are provided, reference them explicitly (e.g. 'As shown in fig-1, ...').",
      },
      remediation: {
        type: "string",
        description:
          "Concrete, actionable remediation steps the development team can follow. Use numbered or bulleted lists. Include code examples where helpful.",
      },
    },
  },
};

const VALID_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ValidImageType = (typeof VALID_IMAGE_TYPES)[number];

async function fetchImageBlock(url: string): Promise<Anthropic.Base64ImageSource | null> {
  try {
    const { body, contentType } = await getStorage().get(url);
    const rawType = contentType.split(";")[0].trim();
    if (!(VALID_IMAGE_TYPES as readonly string[]).includes(rawType)) return null;
    return {
      type: "base64",
      media_type: rawType as ValidImageType,
      data: body.toString("base64"),
    };
  } catch {
    return null;
  }
}

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
  req: NextRequest,
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

  let instruction: string | undefined;
  let notes: string | undefined;
  let clientEvidenceUrls: { key: string; url: string }[] | undefined;
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (parsed.success) {
      instruction = parsed.data.instruction;
      notes = parsed.data.notes;
      clientEvidenceUrls = parsed.data.evidenceUrls;
    }
  } catch {
    // no body — fine
  }

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

  // Build evidence image blocks (up to 4 images to stay within token limits)
  // Prefer client-supplied list (reflects unsaved uploads) over the last DB version
  const rawEvidence = clientEvidenceUrls
    ? clientEvidenceUrls
    : Array.isArray(latestVersion?.evidenceUrls)
      ? (latestVersion.evidenceUrls as { key: string; url: string }[])
      : [];
  const evidenceItems = rawEvidence.slice(0, 4);

  const imageBlocks: Anthropic.ImageBlockParam[] = [];
  const imageKeys: string[] = [];

  for (const item of evidenceItems) {
    if (!item.url) continue;
    const src = await fetchImageBlock(item.url);
    if (!src) continue;
    imageBlocks.push({ type: "image", source: src });
    imageKeys.push(item.key);
  }

  // Build the text prompt
  // notes = tester's raw unsaved text; fall back to saved description if notes not provided
  const testerNotes = notes?.trim() || latestVersion?.description?.trim() || null;
  const savedRemediation = latestVersion?.remediation?.trim() || null;
  const hasImages = imageBlocks.length > 0;

  let prompt = `You are a senior penetration tester writing a professional security audit finding report.

Project: ${projectName}
Finding title: ${f.title}
Risk level: ${f.riskLevel}${playbookContext}`;

  if (testerNotes) {
    prompt += `\n\nTester's notes (use this as your primary source — expand into a professional finding):\n${testerNotes}`;
  }

  if (savedRemediation) {
    prompt += `\n\nExisting remediation (revise and improve this):\n${savedRemediation}`;
  }

  if (hasImages) {
    prompt += `\n\nEvidence (${imageBlocks.length} image${imageBlocks.length > 1 ? "s" : ""} attached above, labelled ${imageKeys.join(", ")}): your description must reference these images explicitly and explain what each one demonstrates about the vulnerability.`;
  }

  if (instruction) {
    prompt += `\n\nAdditional instructions from the tester: ${instruction}`;
  }

  prompt += `\n\nWrite a professional security finding suitable for inclusion in a penetration test report.`;

  const userContent: Anthropic.MessageParam["content"] = [
    ...imageBlocks,
    { type: "text", text: prompt },
  ];

  return makeSSE(async (send) => {
    send({ status: "Drafting finding…" });
    try {
      const message = await client.messages.create({
        model: AI_MODEL,
        max_tokens: 2048,
        tools: [DRAFT_TOOL],
        tool_choice: { type: "tool", name: "write_finding" },
        messages: [{ role: "user", content: userContent }],
      });

      const block = message.content.find((b) => b.type === "tool_use");
      if (!block || block.type !== "tool_use") {
        send({ error: "AI returned an unexpected response format. Please try again." });
        return;
      }

      const { description, remediation } = block.input as {
        description: string;
        remediation: string;
      };

      send({ status: "Saving…" });

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

      send({
        done: true,
        description: description?.trim() ?? "",
        remediation: remediation?.trim() ?? "",
        versionId: newVersion.id,
      });
    } catch (err) {
      send({ error: aiErrorMessage(err) });
    }
  });
}
