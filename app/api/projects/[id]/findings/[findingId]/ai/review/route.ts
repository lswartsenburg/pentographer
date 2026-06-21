import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { project, finding } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";
import { aiErrorMessage } from "@/lib/ai/error";
import type Anthropic from "@anthropic-ai/sdk";
import { getStorage } from "@/lib/storage";

const reviewSchema = z.object({
  title: z.string().max(500),
  description: z.string().max(50000).optional().default(""),
  remediation: z.string().max(50000).optional().default(""),
  riskLevel: z.enum(["high", "medium", "low", "informational"]),
  evidenceUrls: z
    .array(z.object({ key: z.string(), url: z.string() }))
    .optional()
    .default([]),
});

const REVIEW_TOOL: Anthropic.Tool = {
  name: "review_finding",
  description: "Review a penetration test finding for quality and completeness.",
  input_schema: {
    type: "object" as const,
    required: ["completeness", "severity", "suggestions"],
    properties: {
      completeness: {
        type: "string",
        description:
          "1-2 sentence assessment of whether the description and remediation are complete and sufficiently detailed. If evidence images were provided, note whether the description adequately references and explains what they show.",
      },
      severity: {
        type: "string",
        description: "1-2 sentence assessment of whether the risk level is appropriate.",
      },
      suggestions: {
        type: "array",
        description: "2-4 specific, actionable suggestions to improve this finding.",
        items: { type: "string" },
        minItems: 2,
        maxItems: 4,
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; findingId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId, findingId } = await params;

  const client = getAnthropicClient();
  if (!client) {
    return NextResponse.json({ error: "AI_NOT_CONFIGURED" }, { status: 503 });
  }

  const [proj] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, session!.user.id)))
    .limit(1);
  if (!proj) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [f] = await db
    .select()
    .from(finding)
    .where(and(eq(finding.id, findingId), eq(finding.projectId, projectId)))
    .limit(1);
  if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { title, description, remediation, riskLevel, evidenceUrls } = parsed.data;

  // Fetch up to 4 evidence images for vision
  const imageBlocks: Anthropic.ImageBlockParam[] = [];
  const imageKeys: string[] = [];

  for (const item of evidenceUrls.slice(0, 4)) {
    if (!item.url) continue;
    const src = await fetchImageBlock(item.url);
    if (!src) continue;
    imageBlocks.push({ type: "image", source: src });
    imageKeys.push(item.key);
  }

  const hasImages = imageBlocks.length > 0;

  let prompt = `You are a senior security consultant reviewing a penetration test finding for quality and completeness.

Finding title: ${title}
Risk level: ${riskLevel}

Description:
${description || "(empty)"}

Remediation:
${remediation || "(empty)"}`;

  if (hasImages) {
    prompt += `\n\nEvidence (${imageBlocks.length} image${imageBlocks.length > 1 ? "s" : ""} attached above, labelled ${imageKeys.join(", ")}): check whether the description clearly references and explains what each piece of evidence demonstrates. Flag it if the description does not mention the evidence.`;
  }

  const userContent: Anthropic.MessageParam["content"] = [
    ...imageBlocks,
    { type: "text", text: prompt },
  ];

  try {
    const message = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      tools: [REVIEW_TOOL],
      tool_choice: { type: "tool", name: "review_finding" },
      messages: [{ role: "user", content: userContent }],
    });

    const block = message.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      return NextResponse.json(
        { error: "AI returned an unexpected response format. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json(block.input);
  } catch (err) {
    return NextResponse.json({ error: aiErrorMessage(err) }, { status: 500 });
  }
}
