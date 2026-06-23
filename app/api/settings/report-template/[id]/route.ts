import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getStorage } from "@/lib/storage";
import { db } from "@/db/client";
import { reportTemplate } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { requireOrgRole } from "@/lib/org-access";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  version: z.string().max(50).nullable().optional(),
  language: z.string().max(100).nullable().optional(),
  publishNotes: z.string().max(1000).nullable().optional(),
  isPublic: z.boolean().optional(),
});

async function getOrgTemplate(orgId: string, templateId: string) {
  const [row] = await db
    .select()
    .from(reportTemplate)
    .where(and(eq(reportTemplate.id, templateId), eq(reportTemplate.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}

const templateFields = {
  id: reportTemplate.id,
  name: reportTemplate.name,
  description: reportTemplate.description,
  version: reportTemplate.version,
  language: reportTemplate.language,
  publishNotes: reportTemplate.publishNotes,
  isPublic: reportTemplate.isPublic,
  downloadCount: reportTemplate.downloadCount,
  uploadedAt: reportTemplate.uploadedAt,
} as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: templateId } = await params;

  if (!(await requireOrgRole(session!.user.id, session!.user.orgId, "member"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tmpl = await getOrgTemplate(session!.user.orgId, templateId);
  if (!tmpl) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const updates: Partial<typeof reportTemplate.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.version !== undefined) updates.version = parsed.data.version;
  if (parsed.data.language !== undefined) updates.language = parsed.data.language;
  if (parsed.data.publishNotes !== undefined) updates.publishNotes = parsed.data.publishNotes;
  if (parsed.data.isPublic !== undefined) updates.isPublic = parsed.data.isPublic;

  const [updated] = await db
    .update(reportTemplate)
    .set(updates)
    .where(eq(reportTemplate.id, templateId))
    .returning(templateFields);

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: templateId } = await params;

  if (!(await requireOrgRole(session!.user.id, session!.user.orgId, "member"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tmpl = await getOrgTemplate(session!.user.orgId, templateId);
  if (!tmpl) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await getStorage().del(tmpl.blobUrl);
  await db.delete(reportTemplate).where(eq(reportTemplate.id, templateId));

  return NextResponse.json({ deleted: true });
}
