import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getStorage } from "@/lib/storage";
import { db } from "@/db/client";
import { project, finding } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
]);
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

async function verifyAccess(orgId: string, projectId: string, findingId: string) {
  const [proj] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.organizationId, orgId)))
    .limit(1);
  if (!proj) return false;

  const [f] = await db
    .select({ id: finding.id })
    .from(finding)
    .where(and(eq(finding.id, findingId), eq(finding.projectId, projectId)))
    .limit(1);
  return !!f;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; findingId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId, findingId } = await params;

  const ok = await verifyAccess(session!.user.orgId, projectId, findingId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const file = formData.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File exceeds 10 MB limit" }, { status: 400 });
  }

  const filename = `evidence/${projectId}/${findingId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const blob = await getStorage().put(filename, Buffer.from(await file.arrayBuffer()), file.type);
  return NextResponse.json({ url: blob.url });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; findingId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId, findingId } = await params;

  const ok = await verifyAccess(session!.user.orgId, projectId, findingId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { url } = await request.json().catch(() => ({}));
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  await getStorage().del(url);
  return NextResponse.json({ deleted: true });
}
