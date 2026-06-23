import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { customer } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { requireOrgRole } from "@/lib/org-access";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  contactEmail: z.string().email().max(255).optional().nullable(),
});

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const rows = await db
    .select()
    .from(customer)
    .where(eq(customer.organizationId, session!.user.orgId))
    .orderBy(desc(customer.createdAt));

  return NextResponse.json(rows);
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
    .insert(customer)
    .values({
      organizationId: session!.user.orgId,
      userId: session!.user.id,
      name: parsed.data.name.trim(),
      contactEmail: parsed.data.contactEmail ?? null,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
