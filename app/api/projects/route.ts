import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { project, customer, playbookVersion } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

const createSchema = z.object({
  name: z.string().min(1).max(300),
  customerId: z.string().uuid(),
  playbookVersionId: z.string().uuid().optional().nullable(),
  scope: z.string().max(2000).optional().nullable(),
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
    .where(eq(project.userId, session!.user.id))
    .orderBy(desc(project.createdAt));

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

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

  // Verify customer belongs to user
  const [cust] = await db
    .select({ id: customer.id })
    .from(customer)
    .where(eq(customer.id, parsed.data.customerId))
    .limit(1);

  if (!cust) {
    return NextResponse.json({ error: "Customer not found" }, { status: 400 });
  }

  const [created] = await db
    .insert(project)
    .values({
      userId: session!.user.id,
      customerId: parsed.data.customerId,
      playbookVersionId: parsed.data.playbookVersionId ?? null,
      name: parsed.data.name.trim(),
      scope: parsed.data.scope ?? null,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
