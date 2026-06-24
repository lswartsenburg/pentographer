import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { organization, organizationMember } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

const bodySchema = z.object({
  name: z.string().min(1).max(100),
});

export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const [org] = await db
    .insert(organization)
    .values({ name: parsed.data.name.trim() })
    .returning({ id: organization.id, name: organization.name });

  await db.insert(organizationMember).values({
    organizationId: org.id,
    userId: session!.user.id,
    role: "owner",
  });

  return NextResponse.json(org, { status: 201 });
}
