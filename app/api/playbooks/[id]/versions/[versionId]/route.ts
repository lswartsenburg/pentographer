import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { playbook, playbookVersion } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

const patchSchema = z.object({
  status: z.literal("published"),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id, versionId } = await params;

  // Only the owner can publish
  const [pb] = await db
    .select()
    .from(playbook)
    .where(and(eq(playbook.id, id), eq(playbook.userId, session!.user.id)))
    .limit(1);

  if (!pb) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [version] = await db
    .select()
    .from(playbookVersion)
    .where(and(eq(playbookVersion.id, versionId), eq(playbookVersion.playbookId, id)))
    .limit(1);

  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (version.status !== "draft")
    return NextResponse.json({ error: "Only draft versions can be published" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const [updated] = await db
    .update(playbookVersion)
    .set({ status: "published" })
    .where(eq(playbookVersion.id, versionId))
    .returning();

  return NextResponse.json(updated);
}
