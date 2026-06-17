import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { project, finding, findingVersion } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; findingId: string; versionId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId, findingId, versionId } = await params;

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

  const [source] = await db
    .select()
    .from(findingVersion)
    .where(and(eq(findingVersion.id, versionId), eq(findingVersion.findingId, findingId)))
    .limit(1);
  if (!source) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  const result = await db.transaction(async (tx) => {
    // authorType is always "human" for restore operations — never from client
    const [newVersion] = await tx
      .insert(findingVersion)
      .values({
        findingId,
        title: source.title,
        description: source.description,
        remediation: source.remediation,
        riskLevel: source.riskLevel,
        cvssScore: source.cvssScore,
        status: source.status,
        evidenceUrls: source.evidenceUrls,
        authorType: "human",
      })
      .returning();

    await tx
      .update(finding)
      .set({
        title: source.title,
        riskLevel: source.riskLevel,
        status: source.status,
        cvssScore: source.cvssScore,
      })
      .where(eq(finding.id, findingId));

    return newVersion;
  });

  return NextResponse.json(result, { status: 201 });
}
