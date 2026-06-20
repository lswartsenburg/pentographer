import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { project, finding, executiveSummaryVersion, customer } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId } = await params;

  const client = getAnthropicClient();
  if (!client) {
    return NextResponse.json({ error: "AI_NOT_CONFIGURED" }, { status: 503 });
  }

  const [proj] = await db
    .select({ id: project.id, name: project.name, customerId: project.customerId })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, session!.user.id)))
    .limit(1);
  if (!proj) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [cust] = await db
    .select({ name: customer.name })
    .from(customer)
    .where(eq(customer.id, proj.customerId))
    .limit(1);

  const findings = await db
    .select({ title: finding.title, riskLevel: finding.riskLevel, status: finding.status })
    .from(finding)
    .where(eq(finding.projectId, projectId));

  const riskCounts = { high: 0, medium: 0, low: 0, informational: 0 };
  for (const f of findings) {
    riskCounts[f.riskLevel] = (riskCounts[f.riskLevel] ?? 0) + 1;
  }

  const findingsSummary =
    findings.length > 0
      ? findings.map((f) => `- [${f.riskLevel.toUpperCase()}] ${f.title} (${f.status})`).join("\n")
      : "No findings documented.";

  const prompt = `You are a senior security consultant writing an executive summary for a penetration test report.

Client: ${cust?.name ?? "the client"}
Project: ${proj.name}
Total findings: ${findings.length} (${riskCounts.high} High, ${riskCounts.medium} Medium, ${riskCounts.low} Low, ${riskCounts.informational} Informational)

Findings:
${findingsSummary}

Write a professional executive summary suitable for a non-technical audience (C-suite / management). Use markdown formatting. Structure:
1. A brief opening paragraph summarising the engagement and overall security posture.
2. A paragraph on key findings and risk areas, referencing the most critical issues by name.
3. A closing paragraph with high-level remediation priorities and next steps.

Keep it to 250-400 words. Do not use headers — write as flowing prose paragraphs.`;

  const accumulated: { content: string } = { content: "" };

  const stream = new ReadableStream({
    async start(controller) {
      const encode = (data: object) =>
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        const anthropicStream = client.messages.stream({
          model: AI_MODEL,
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        });

        for await (const event of anthropicStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            accumulated.content += event.delta.text;
            encode({ field: "content", text: event.delta.text });
          }
        }

        // Save AI version after stream completes
        const [newVersion] = await db
          .insert(executiveSummaryVersion)
          .values({
            projectId,
            content: accumulated.content.trim(),
            authorType: "ai",
          })
          .returning({ id: executiveSummaryVersion.id });

        encode({ done: true, versionId: newVersion.id });
      } catch (err) {
        encode({ error: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
