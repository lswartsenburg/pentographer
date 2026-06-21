import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getStorage } from "@/lib/storage";
import { db } from "@/db/client";
import { reportTemplate } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

const MAX_SIZE = 5 * 1024 * 1024;
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function GET(_req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const rows = await db
    .select({
      id: reportTemplate.id,
      name: reportTemplate.name,
      description: reportTemplate.description,
      version: reportTemplate.version,
      language: reportTemplate.language,
      publishNotes: reportTemplate.publishNotes,
      isPublic: reportTemplate.isPublic,
      downloadCount: reportTemplate.downloadCount,
      uploadedAt: reportTemplate.uploadedAt,
    })
    .from(reportTemplate)
    .where(eq(reportTemplate.userId, session!.user.id))
    .orderBy(desc(reportTemplate.uploadedAt));

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.type !== DOCX_TYPE) {
    return NextResponse.json({ error: "File must be a .docx document" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Template file exceeds 5 MB limit" }, { status: 400 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const blobKey = `templates/${session!.user.id}/${Date.now()}-${safeName}`;
  const blob = await getStorage().put(blobKey, Buffer.from(await file.arrayBuffer()), file.type);

  const [row] = await db
    .insert(reportTemplate)
    .values({
      userId: session!.user.id,
      name: file.name,
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

  return NextResponse.json(row, { status: 201 });
}
