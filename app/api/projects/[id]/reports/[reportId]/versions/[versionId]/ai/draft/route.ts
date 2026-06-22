import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { project, finding, findingVersion, customer, reportVersion } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { verifyReportVersionAccess } from "@/lib/project-access";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";
import { aiErrorMessage } from "@/lib/ai/error";

export const maxDuration = 120;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; reportId: string; versionId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId, reportId, versionId } = await params;

  const access = await verifyReportVersionAccess(session!.user.id, projectId, reportId, versionId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (access.reportVersionRow.status === "published") {
    return NextResponse.json(
      { error: "Published report versions cannot be edited" },
      { status: 409 }
    );
  }

  const client = getAnthropicClient();
  if (!client) return NextResponse.json({ error: "AI_NOT_CONFIGURED" }, { status: 503 });

  const [proj] = await db
    .select({ name: project.name, customerId: project.customerId })
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1);

  const [cust] = await db
    .select({ name: customer.name })
    .from(customer)
    .where(eq(customer.id, proj.customerId))
    .limit(1);

  // Use snapshot if published, otherwise latest finding versions
  const snapshot = access.reportVersionRow.findingSnapshot;
  const findings = await db
    .select({ id: finding.id, title: finding.title, riskLevel: finding.riskLevel })
    .from(finding)
    .where(eq(finding.projectId, projectId));

  const findingDetails = await Promise.all(
    findings.map(async (f) => {
      if (snapshot) {
        const entry = snapshot.find((s) => s.findingId === f.id);
        if (!entry) return null;
        const [fv] = await db
          .select({ status: findingVersion.status })
          .from(findingVersion)
          .where(eq(findingVersion.id, entry.findingVersionId))
          .limit(1);
        return { ...f, status: fv?.status ?? "draft" };
      }
      const [latest] = await db
        .select({ status: findingVersion.status })
        .from(findingVersion)
        .where(eq(findingVersion.findingId, f.id))
        .orderBy(desc(findingVersion.createdAt))
        .limit(1);
      return { ...f, status: latest?.status ?? "draft" };
    })
  );

  const activeFindingDetails = findingDetails.filter(Boolean) as {
    id: string;
    title: string;
    riskLevel: string;
    status: string;
  }[];

  const riskCounts = { high: 0, medium: 0, low: 0, informational: 0 };
  for (const f of activeFindingDetails) {
    riskCounts[f.riskLevel as keyof typeof riskCounts]++;
  }

  const findingsSummary =
    activeFindingDetails.length > 0
      ? activeFindingDetails
          .map((f) => `- [${f.riskLevel.toUpperCase()}] ${f.title} (${f.status})`)
          .join("\n")
      : "No findings documented.";

  const prompt = `You are a senior security consultant writing an executive summary for a penetration test report.

Client: ${cust?.name ?? "the client"}
Project: ${proj.name}
Total findings: ${activeFindingDetails.length} (${riskCounts.high} High, ${riskCounts.medium} Medium, ${riskCounts.low} Low, ${riskCounts.informational} Informational)

Findings:
${findingsSummary}

Write a professional executive summary suitable for a non-technical audience (C-suite / management). Use markdown formatting. Structure:
1. A brief opening paragraph summarising the engagement and overall security posture.
2. A paragraph on key findings and risk areas, referencing the most critical issues by name.
3. A closing paragraph with high-level remediation priorities and next steps.

Keep it to 250-400 words. Do not use headers — write as flowing prose paragraphs. Do not include a risk count table; that will be auto-generated separately.`;

  const accumulated = { content: "" };

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

        await db
          .update(reportVersion)
          .set({ execSummary: accumulated.content.trim(), authorType: "ai" })
          .where(eq(reportVersion.id, versionId));

        encode({ done: true });
      } catch (err) {
        encode({ error: aiErrorMessage(err) });
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
