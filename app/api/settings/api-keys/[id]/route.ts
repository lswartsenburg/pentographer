import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKey } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const result = await db
    .delete(apiKey)
    .where(and(eq(apiKey.id, id), eq(apiKey.userId, session!.user.id)))
    .returning({ id: apiKey.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
