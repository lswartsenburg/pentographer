import { NextRequest, NextResponse } from "next/server";
import { eq, or, isNull, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { playbook, playbookVersion } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { requireOrgRole } from "@/lib/org-access";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
});

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const rows = await db
    .select({
      id: playbook.id,
      name: playbook.name,
      description: playbook.description,
      organizationId: playbook.organizationId,
      userId: playbook.userId,
      isPublic: playbook.isPublic,
      createdAt: playbook.createdAt,
    })
    .from(playbook)
    .where(
      or(
        eq(playbook.organizationId, session!.user.orgId),
        isNull(playbook.organizationId) // system/public playbooks
      )
    )
    .orderBy(desc(playbook.createdAt));

  // Attach latest version number for each playbook
  const withVersions = await Promise.all(
    rows.map(async (pb) => {
      const [latest] = await db
        .select({
          version: playbookVersion.version,
          id: playbookVersion.id,
          status: playbookVersion.status,
        })
        .from(playbookVersion)
        .where(eq(playbookVersion.playbookId, pb.id))
        .orderBy(desc(playbookVersion.createdAt))
        .limit(1);
      return { ...pb, latestVersion: latest ?? null };
    })
  );

  return NextResponse.json(withVersions);
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  if (!(await requireOrgRole(session!.user.id, session!.user.orgId, "member"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  const [created] = await db
    .insert(playbook)
    .values({
      organizationId: session!.user.orgId,
      userId: session!.user.id,
      name: parsed.data.name.trim(),
      description: parsed.data.description ?? null,
    })
    .returning();

  const [version] = await db
    .insert(playbookVersion)
    .values({
      playbookId: created.id,
      version: "1.0",
      changelog: "Initial version.",
      isActive: true,
    })
    .returning();

  return NextResponse.json({ ...created, latestVersion: version }, { status: 201 });
}
