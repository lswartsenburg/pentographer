import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { playbook, playbookVersion, playbookCategory } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  frameworkRef: z.string().max(50).optional().nullable(),
  displayOrder: z.number().int().optional(),
});

async function getAccessibleVersion(userId: string, playbookId: string, versionId: string) {
  const [pb] = await db
    .select()
    .from(playbook)
    .where(and(eq(playbook.id, playbookId), or(eq(playbook.userId, userId), isNull(playbook.userId))))
    .limit(1);
  if (!pb) return null;

  const [version] = await db
    .select()
    .from(playbookVersion)
    .where(and(eq(playbookVersion.id, versionId), eq(playbookVersion.playbookId, playbookId)))
    .limit(1);
  return version ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id, versionId } = await params;

  const version = await getAccessibleVersion(session!.user.id, id, versionId);
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const categories = await db
    .select()
    .from(playbookCategory)
    .where(eq(playbookCategory.playbookVersionId, versionId))
    .orderBy(playbookCategory.displayOrder);

  return NextResponse.json(categories);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id, versionId } = await params;

  const [pb] = await db
    .select()
    .from(playbook)
    .where(and(eq(playbook.id, id), eq(playbook.userId, session!.user.id)))
    .limit(1);
  if (!pb) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const version = await getAccessibleVersion(session!.user.id, id, versionId);
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const [created] = await db
    .insert(playbookCategory)
    .values({
      playbookVersionId: versionId,
      name: parsed.data.name.trim(),
      frameworkRef: parsed.data.frameworkRef ?? null,
      displayOrder: parsed.data.displayOrder ?? 0,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
