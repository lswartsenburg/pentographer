import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { reportTemplate, userAccount } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const rows = await db
    .select({
      id: reportTemplate.id,
      userId: reportTemplate.userId,
      name: reportTemplate.name,
      description: reportTemplate.description,
      version: reportTemplate.version,
      language: reportTemplate.language,
      publishNotes: reportTemplate.publishNotes,
      downloadCount: reportTemplate.downloadCount,
      uploadedAt: reportTemplate.uploadedAt,
      authorName: userAccount.name,
    })
    .from(reportTemplate)
    .innerJoin(userAccount, eq(reportTemplate.userId, userAccount.id))
    .where(eq(reportTemplate.isPublic, true))
    .orderBy(desc(reportTemplate.downloadCount), desc(reportTemplate.uploadedAt));

  return NextResponse.json(rows);
}
