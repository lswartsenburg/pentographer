import { NextRequest, NextResponse } from "next/server";
import { eq, and, count } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { customer, project } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { requireOrgRole } from "@/lib/org-access";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  contactEmail: z.string().email().max(255).nullable().optional(),
});

async function getOrgCustomer(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(customer)
    .where(and(eq(customer.id, id), eq(customer.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  const row = await getOrgCustomer(session!.user.orgId, id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(row);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  if (!(await requireOrgRole(session!.user.id, session!.user.orgId, "member"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const row = await getOrgCustomer(session!.user.orgId, id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const [updated] = await db
    .update(customer)
    .set({
      ...(parsed.data.name !== undefined && { name: parsed.data.name.trim() }),
      ...(parsed.data.contactEmail !== undefined && { contactEmail: parsed.data.contactEmail }),
    })
    .where(eq(customer.id, id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  if (!(await requireOrgRole(session!.user.id, session!.user.orgId, "member"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const row = await getOrgCustomer(session!.user.orgId, id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ projectCount }] = await db
    .select({ projectCount: count() })
    .from(project)
    .where(eq(project.customerId, id));

  if (projectCount > 0) {
    return NextResponse.json(
      { error: "Cannot delete a customer that has projects. Delete all projects first." },
      { status: 409 }
    );
  }

  await db.delete(customer).where(eq(customer.id, id));

  return NextResponse.json({ success: true });
}
