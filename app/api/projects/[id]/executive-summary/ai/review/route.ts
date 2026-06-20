import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { project } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";
import { aiErrorMessage } from "@/lib/ai/error";

const reviewSchema = z.object({
  content: z.string().max(50000),
});

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

  const prompt = `You are a senior security consultant reviewing an executive summary written for a penetration test report.

Executive summary:
${parsed.data.content || "(empty)"}

Review this executive summary and respond with a JSON object with exactly these three keys:
- "clarity": A 1-2 sentence assessment of how clearly the summary communicates to a non-technical audience.
- "accuracy": A 1-2 sentence assessment of whether the summary appears to accurately reflect a typical security assessment (note: you don't have the underlying findings, so focus on internal consistency and completeness of coverage).
- "suggestions": An array of 2-4 specific, actionable suggestions to improve the summary. Each suggestion should be a short string.

Respond with ONLY the JSON object. No preamble or explanation.`;

  try {
    const message = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const cleaned = start !== -1 && end > start ? raw.slice(start, end + 1) : raw.trim();

    let review: { clarity: string; accuracy: string; suggestions: string[] };
    try {
      review = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "AI returned an unexpected response format. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json(review);
  } catch (err) {
    return NextResponse.json({ error: aiErrorMessage(err) }, { status: 500 });
  }
}
