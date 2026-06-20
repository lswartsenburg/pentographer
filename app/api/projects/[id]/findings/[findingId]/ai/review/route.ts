import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { project, finding } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";

const reviewSchema = z.object({
  title: z.string().max(500),
  description: z.string().max(50000).optional().default(""),
  remediation: z.string().max(50000).optional().default(""),
  riskLevel: z.enum(["high", "medium", "low", "informational"]),
});

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

  // Verify ownership
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

  const { title, description, remediation, riskLevel } = parsed.data;

  const prompt = `You are a senior security consultant reviewing a penetration test finding for quality and completeness.

Finding title: ${title}
Risk level: ${riskLevel}

Description:
${description || "(empty)"}

Remediation:
${remediation || "(empty)"}

Review this finding and respond with a JSON object with exactly these three keys:
- "completeness": A 1-2 sentence assessment of whether the description and remediation are complete and sufficiently detailed.
- "severity": A 1-2 sentence assessment of whether the risk level is appropriate for what is described.
- "suggestions": An array of 2-4 specific, actionable suggestions to improve this finding. Each suggestion should be a short string.

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

    let review: { completeness: string; severity: string; suggestions: string[] };
    try {
      review = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    return NextResponse.json(review);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
