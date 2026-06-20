import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { project, finding, findingVersion, auditLog } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { isBackwardTransition } from "@/lib/finding-transitions";

const saveSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(50000).nullable().optional(),
  remediation: z.string().max(50000).nullable().optional(),
  riskLevel: z.enum(["high", "medium", "low", "informational"]),
  cvssScore: z.string().nullable().optional(),
  status: z.enum(["draft", "in_review", "confirmed", "informational", "false_positive"]),
  evidenceUrls: z.array(z.object({ key: z.string().max(50), url: z.string().url() })).max(20).optional(),
  justification: z.string().optional(),
  // authorType is NOT in this schema — it is always set server-side
});

async function getOwnedFinding(userId: string, projectId: string, findingId: string) {
  const [proj] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)))
    .limit(1);
  if (!proj) return null;

  const [row] = await db
    .select()
    .from(finding)
    .where(and(eq(finding.id, findingId), eq(finding.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; findingId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId, findingId } = await params;

  const f = await getOwnedFinding(session!.user.id, projectId, findingId);
  if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const versions = await db
    .select()
    .from(findingVersion)
    .where(eq(findingVersion.findingId, findingId))
    .orderBy(desc(findingVersion.createdAt));

  return NextResponse.json(versions);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; findingId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId, findingId } = await params;

  const f = await getOwnedFinding(session!.user.id, projectId, findingId);
  if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Enforce backward transition rule
  if (isBackwardTransition(f.status, parsed.data.status)) {
    if (!parsed.data.justification?.trim()) {
      return NextResponse.json(
        { error: "A justification is required when reversing a finding status." },
        { status: 422 }
      );
    }
    await db.insert(auditLog).values({
      userId: session!.user.id,
      action: "status_backward",
      resourceType: "finding",
      resourceId: findingId,
      metadata: {
        from: f.status,
        to: parsed.data.status,
        justification: parsed.data.justification,
      },
    });
  }

  const result = await db.transaction(async (tx) => {
    // authorType is always "human" for user saves — never from client payload
    const [newVersion] = await tx
      .insert(findingVersion)
      .values({
        findingId,
        title: parsed.data.title.trim(),
        description: parsed.data.description ?? null,
        remediation: parsed.data.remediation ?? null,
        riskLevel: parsed.data.riskLevel,
        cvssScore: parsed.data.cvssScore ?? null,
        status: parsed.data.status,
        evidenceUrls: parsed.data.evidenceUrls ?? [],
        authorType: "human",
      })
      .returning();

    // Keep denormalized fields on finding in sync
    await tx
      .update(finding)
      .set({
        title: parsed.data.title.trim(),
        riskLevel: parsed.data.riskLevel,
        status: parsed.data.status,
        cvssScore: parsed.data.cvssScore ?? null,
      })
      .where(eq(finding.id, findingId));

    return newVersion;
  });

  return NextResponse.json(result, { status: 201 });
}
