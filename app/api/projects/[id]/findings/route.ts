import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { project, finding, findingVersion } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

const createSchema = z.object({
  title: z.string().min(1).max(500),
  riskLevel: z.enum(["high", "medium", "low", "informational"]).default("medium"),
  playbookItemId: z.string().uuid().nullable().optional(),
  isAdhoc: z.boolean().default(false),
  description: z.string().max(50000).optional().nullable(),
  remediation: z.string().max(50000).optional().nullable(),
});

async function getOwnedProject(userId: string, projectId: string) {
  const [row] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId } = await params;

  const proj = await getOwnedProject(session!.user.id, projectId);
  if (!proj) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await db
    .select()
    .from(finding)
    .where(eq(finding.projectId, projectId))
    .orderBy(desc(finding.createdAt));

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId } = await params;

  const proj = await getOwnedProject(session!.user.id, projectId);
  if (!proj) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const [newFinding] = await tx
      .insert(finding)
      .values({
        projectId,
        title: parsed.data.title.trim(),
        riskLevel: parsed.data.riskLevel,
        status: "draft",
        playbookItemId: parsed.data.playbookItemId ?? null,
        isAdhoc: parsed.data.isAdhoc,
      })
      .returning();

    await tx.insert(findingVersion).values({
      findingId: newFinding.id,
      title: parsed.data.title.trim(),
      description: parsed.data.description ?? null,
      remediation: parsed.data.remediation ?? null,
      riskLevel: parsed.data.riskLevel,
      cvssScore: null,
      status: "draft",
      evidenceUrls: [],
      // authorType is always "human" for user-created findings — never from client
      authorType: "human",
    });

    return newFinding;
  });

  return NextResponse.json(result, { status: 201 });
}
