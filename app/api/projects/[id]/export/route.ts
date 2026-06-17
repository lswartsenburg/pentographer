import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  project,
  customer,
  finding,
  findingVersion,
  executiveSummaryVersion,
  auditLog,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { generateDocx } from "@/lib/export/word";
import { generatePdf } from "@/lib/export/pdf";

const exportSchema = z.object({
  format: z.enum(["docx", "pdf"]),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId } = await params;

  const [proj] = await db
    .select({
      id: project.id,
      name: project.name,
      scope: project.scope,
      customerName: customer.name,
    })
    .from(project)
    .leftJoin(customer, eq(project.customerId, customer.id))
    .where(and(eq(project.id, projectId), eq(project.userId, session!.user.id)))
    .limit(1);

  if (!proj) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = exportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Load latest version of each finding
  const findings = await db.select().from(finding).where(eq(finding.projectId, projectId));

  const findingsWithVersions = await Promise.all(
    findings.map(async (f) => {
      const [latest] = await db
        .select()
        .from(findingVersion)
        .where(eq(findingVersion.findingId, f.id))
        .orderBy(desc(findingVersion.createdAt))
        .limit(1);

      return {
        title: f.title,
        riskLevel: f.riskLevel,
        cvssScore: f.cvssScore,
        status: f.status,
        description: latest?.description ?? null,
        remediation: latest?.remediation ?? null,
        evidenceUrls: latest?.evidenceUrls ?? [],
      };
    })
  );

  const [execSummaryRow] = await db
    .select()
    .from(executiveSummaryVersion)
    .where(eq(executiveSummaryVersion.projectId, projectId))
    .orderBy(desc(executiveSummaryVersion.createdAt))
    .limit(1);

  const exportData = {
    projectName: proj.name,
    customerName: proj.customerName ?? "—",
    scope: proj.scope,
    startDate: null,
    endDate: null,
    execSummary: execSummaryRow?.content ?? null,
    findings: findingsWithVersions,
  };

  await db.insert(auditLog).values({
    userId: session!.user.id,
    action: "export",
    resourceType: "project",
    resourceId: projectId,
    metadata: { format: parsed.data.format },
  });

  const format = parsed.data.format;
  const filename = `${proj.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_report.${format}`;

  if (format === "docx") {
    const buffer = await generateDocx(exportData);
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const buffer = await generatePdf(exportData);
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
