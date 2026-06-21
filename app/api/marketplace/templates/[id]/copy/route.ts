import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { getStorage } from "@/lib/storage";
import { db } from "@/db/client";
import { reportTemplate } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: templateId } = await params;

  const [original] = await db
    .select()
    .from(reportTemplate)
    .where(and(eq(reportTemplate.id, templateId), eq(reportTemplate.isPublic, true)))
    .limit(1);

  if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (original.userId === session!.user.id) {
    return NextResponse.json({ error: "This is already your template" }, { status: 409 });
  }

  const safeName = original.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const toPathname = `templates/${session!.user.id}/${Date.now()}-${safeName}`;

  const blob = await getStorage().copy(original.blobUrl, toPathname);

  const [newRow] = await db
    .insert(reportTemplate)
    .values({
      userId: session!.user.id,
      name: original.name,
      description: original.description,
      version: original.version,
      language: original.language,
      publishNotes: original.publishNotes,
      blobUrl: blob.url,
    })
    .returning({
      id: reportTemplate.id,
      name: reportTemplate.name,
      description: reportTemplate.description,
      version: reportTemplate.version,
      language: reportTemplate.language,
      publishNotes: reportTemplate.publishNotes,
      isPublic: reportTemplate.isPublic,
      downloadCount: reportTemplate.downloadCount,
      uploadedAt: reportTemplate.uploadedAt,
    });

  await db
    .update(reportTemplate)
    .set({ downloadCount: sql`${reportTemplate.downloadCount} + 1` })
    .where(eq(reportTemplate.id, templateId));

  return NextResponse.json(newRow, { status: 201 });
}
