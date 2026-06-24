import { NextRequest, NextResponse } from "next/server";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { project, customer, playbookVersion } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { requireOrgRole } from "@/lib/org-access";

const testAccountSchema = z.object({ role: z.string().max(100), username: z.string().max(200) });

const createSchema = z.object({
  name: z.string().min(1).max(300),
  customerId: z.string().uuid(),
  playbookVersionId: z.string().uuid().optional().nullable(),
  scope: z.string().max(2000).optional().nullable(),
  applicationUrl: z.string().url().max(2000).optional().nullable(),
  testAccounts: z.array(testAccountSchema).optional().nullable(),
  startDate: z.string().datetime({ offset: true }).optional().nullable(),
  endDate: z.string().datetime({ offset: true }).optional().nullable(),
});

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const rows = await db
    .select({
      id: project.id,
      name: project.name,
      status: project.status,
      scope: project.scope,
      startDate: project.startDate,
      endDate: project.endDate,
      createdAt: project.createdAt,
      customerId: project.customerId,
      customerName: customer.name,
      playbookVersionId: project.playbookVersionId,
      playbookVersion: playbookVersion.version,
    })
    .from(project)
    .leftJoin(customer, eq(project.customerId, customer.id))
    .leftJoin(playbookVersion, eq(project.playbookVersionId, playbookVersion.id))
    .where(eq(project.organizationId, session!.user.orgId))
    .orderBy(desc(project.createdAt));

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

  // Verify customer belongs to the same org
  const [cust] = await db
    .select({ id: customer.id })
    .from(customer)
    .where(
      and(eq(customer.id, parsed.data.customerId), eq(customer.organizationId, session!.user.orgId))
    )
    .limit(1);

  if (!cust) {
    return NextResponse.json({ error: "Customer not found" }, { status: 400 });
  }

  const [created] = await db
    .insert(project)
    .values({
      organizationId: session!.user.orgId,
      userId: session!.user.id,
      customerId: parsed.data.customerId,
      playbookVersionId: parsed.data.playbookVersionId ?? null,
      name: parsed.data.name.trim(),
      scope: parsed.data.scope ?? null,
      applicationUrl: parsed.data.applicationUrl ?? null,
      testAccounts: parsed.data.testAccounts ?? null,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
