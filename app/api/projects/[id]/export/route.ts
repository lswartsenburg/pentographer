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
  reportTemplate,
  reportVersion,
  userAccount,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { verifyReportVersionAccess } from "@/lib/project-access";
import { decrypt } from "@/lib/crypto";
import { generateDocx } from "@/lib/export/word";
import {
  generateDocxFromTemplate,
  TemplateRenderError,
  type ExportData,
} from "@/lib/export/word-template";
import { generatePdf } from "@/lib/export/pdf";
import { generateMarkdownZip } from "@/lib/export/markdown";
import { getStorage } from "@/lib/storage";

const exportSchema = z.object({
  format: z.enum(["docx", "pdf", "markdown"]),
  templateId: z.string().uuid().optional(),
  reportVersionId: z.string().uuid().optional(),
});

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId } = await params;

  const [proj] = await db
    .select({
      id: project.id,
      name: project.name,
      scope: project.scope,
      applicationUrl: project.applicationUrl,
      testAccounts: project.testAccounts,
      customerName: customer.name,
    })
    .from(project)
    .leftJoin(customer, eq(project.customerId, customer.id))
    .where(and(eq(project.id, projectId), eq(project.userId, session!.user.id)))
    .limit(1);

  if (!proj) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [user] = await db
    .select({ organizationName: userAccount.organizationName })
    .from(userAccount)
    .where(eq(userAccount.id, session!.user.id))
    .limit(1);

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

  const isTemplateExport = parsed.data.format === "docx" && !!parsed.data.templateId;

  // Resolve exec summary and report version string
  let execSummary: string | null = null;
  let reportVersionString: string | null = null;
  let findingSnapshotMap: Map<string, string> | null = null; // findingId → findingVersionId

  if (parsed.data.reportVersionId) {
    // Find the report this version belongs to — we need reportId for the access check
    const [rv] = await db
      .select()
      .from(reportVersion)
      .where(eq(reportVersion.id, parsed.data.reportVersionId))
      .limit(1);

    if (!rv) return NextResponse.json({ error: "Report version not found" }, { status: 404 });

    const access = await verifyReportVersionAccess(session!.user.id, projectId, rv.reportId, rv.id);
    if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

    execSummary = rv.execSummary || null;
    reportVersionString = rv.version;

    if (rv.findingSnapshot) {
      findingSnapshotMap = new Map(
        rv.findingSnapshot.map((s) => [s.findingId, s.findingVersionId])
      );
    }
  } else {
    // Legacy: use latest executive summary version
    const [execSummaryRow] = await db
      .select()
      .from(executiveSummaryVersion)
      .where(eq(executiveSummaryVersion.projectId, projectId))
      .orderBy(desc(executiveSummaryVersion.createdAt))
      .limit(1);
    execSummary = execSummaryRow?.content ?? null;
  }

  // Load findings — restrict to snapshot if one exists
  const allFindings = await db.select().from(finding).where(eq(finding.projectId, projectId));

  const eligibleFindings = findingSnapshotMap
    ? allFindings.filter((f) => findingSnapshotMap!.has(f.id))
    : allFindings;

  const findingsWithVersions = await Promise.all(
    eligibleFindings.map(async (f) => {
      let fv;
      if (findingSnapshotMap?.has(f.id)) {
        const fvId = findingSnapshotMap.get(f.id)!;
        [fv] = await db.select().from(findingVersion).where(eq(findingVersion.id, fvId)).limit(1);
      } else {
        [fv] = await db
          .select()
          .from(findingVersion)
          .where(eq(findingVersion.findingId, f.id))
          .orderBy(desc(findingVersion.createdAt))
          .limit(1);
      }

      const evidenceUrls = fv?.evidenceUrls ?? [];

      let evidenceImages: Array<{ image: Buffer; caption: string }> | undefined;
      if (isTemplateExport && evidenceUrls.length > 0) {
        const settled = await Promise.allSettled(
          evidenceUrls.map(async ({ key, url }) => {
            const result = await getStorage().get(url);
            if (!IMAGE_MIME_TYPES.has(result.contentType)) return null;
            return { image: result.body, caption: key };
          })
        );
        evidenceImages = settled
          .filter(
            (r): r is PromiseFulfilledResult<{ image: Buffer; caption: string }> =>
              r.status === "fulfilled" && r.value !== null
          )
          .map((r) => r.value);
      }

      return {
        title: f.title,
        riskLevel: f.riskLevel,
        cvssScore: f.cvssScore,
        status: f.status,
        description: fv?.description ?? null,
        remediation: fv?.remediation ?? null,
        evidenceUrls,
        evidenceImages,
      };
    })
  );

  const exportData: ExportData = {
    projectName: proj.name,
    customerName: proj.customerName ?? "—",
    scope: proj.scope ?? null,
    applicationUrl: proj.applicationUrl ?? null,
    reportVersion: reportVersionString,
    testAccounts: proj.testAccounts
      ? proj.testAccounts.map(({ role, username, encryptedPassword }) => ({
          role,
          username,
          ...(encryptedPassword
            ? {
                password: (() => {
                  try {
                    return decrypt(encryptedPassword);
                  } catch {
                    return undefined;
                  }
                })(),
              }
            : {}),
        }))
      : null,
    organizationName: user?.organizationName ?? null,
    startDate: null,
    endDate: null,
    execSummary,
    findings: findingsWithVersions,
  };

  await db.insert(auditLog).values({
    userId: session!.user.id,
    action: "export",
    resourceType: "project",
    resourceId: projectId,
    metadata: {
      format: parsed.data.format,
      reportVersionId: parsed.data.reportVersionId ?? null,
    },
  });

  const format = parsed.data.format;
  const slug = proj.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const ext = format === "markdown" ? "zip" : format;
  const filename = `${slug}_report.${ext}`;

  if (format === "docx") {
    const docxHeaders = {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    };

    const { templateId } = parsed.data;
    if (templateId) {
      const [tmpl] = await db
        .select({ blobUrl: reportTemplate.blobUrl })
        .from(reportTemplate)
        .where(and(eq(reportTemplate.id, templateId), eq(reportTemplate.userId, session!.user.id)))
        .limit(1);

      if (!tmpl) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
      }

      let templateBuffer: Buffer;
      try {
        const { body } = await getStorage().get(tmpl.blobUrl);
        templateBuffer = body;
      } catch {
        return NextResponse.json({ error: "Failed to fetch template" }, { status: 502 });
      }
      try {
        const buffer = generateDocxFromTemplate(templateBuffer, exportData);
        return new NextResponse(buffer as unknown as BodyInit, { headers: docxHeaders });
      } catch (err) {
        if (err instanceof TemplateRenderError) {
          return NextResponse.json({ error: `Template error: ${err.message}` }, { status: 422 });
        }
        throw err;
      }
    }

    const buffer = await generateDocx(exportData);
    return new NextResponse(buffer as unknown as BodyInit, { headers: docxHeaders });
  }

  if (format === "pdf") {
    const buffer = await generatePdf(exportData);
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  // markdown zip
  const buffer = await generateMarkdownZip(exportData);
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
