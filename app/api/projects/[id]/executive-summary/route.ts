import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { project, executiveSummaryVersion } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

const saveSchema = z.object({
  content: z.string().max(50000),
  // authorType is NEVER accepted from the client — always set server-side
});

async function getOwnedProject(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, id), eq(project.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  const proj = await getOwnedProject(session!.user.id, id);
  if (!proj) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const versions = await db
    .select()
    .from(executiveSummaryVersion)
    .where(eq(executiveSummaryVersion.projectId, id))
    .orderBy(desc(executiveSummaryVersion.createdAt));

  const latest = versions[0] ?? null;

  return NextResponse.json({ latest, history: versions });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  const proj = await getOwnedProject(session!.user.id, id);
  if (!proj) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

  // authorType is always "human" for user saves — never from client payload
  const [created] = await db
    .insert(executiveSummaryVersion)
    .values({
      projectId: id,
      content: parsed.data.content,
      authorType: "human",
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
