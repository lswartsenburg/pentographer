import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { project } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";
import { aiErrorMessage } from "@/lib/ai/error";
import type Anthropic from "@anthropic-ai/sdk";

const reviewSchema = z.object({
  content: z.string().max(50000),
});

const REVIEW_TOOL: Anthropic.Tool = {
  name: "review_executive_summary",
  description: "Review an executive summary for a penetration test report.",
  input_schema: {
    type: "object" as const,
    required: ["clarity", "accuracy", "suggestions"],
    properties: {
      clarity: {
        type: "string",
        description:
          "1-2 sentence assessment of how clearly the summary communicates to a non-technical audience.",
      },
      accuracy: {
        type: "string",
        description:
          "1-2 sentence assessment of whether the summary appears to accurately reflect a security assessment (focus on internal consistency and completeness).",
      },
      suggestions: {
        type: "array",
        description: "2-4 specific, actionable suggestions to improve the summary.",
        items: { type: "string" },
        minItems: 2,
        maxItems: 4,
      },
    },
  },
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId } = await params;

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

  try {
    const message = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      tools: [REVIEW_TOOL],
      tool_choice: { type: "tool", name: "review_executive_summary" },
      messages: [
        {
          role: "user",
          content: `You are a senior security consultant reviewing an executive summary written for a penetration test report.

Executive summary:
${parsed.data.content || "(empty)"}`,
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

    return NextResponse.json(block.input);
  } catch (err) {
    return NextResponse.json({ error: aiErrorMessage(err) }, { status: 500 });
  }
}
