import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getEnvKeyUsage } from "@/lib/ai/client";
import { db } from "@/db/client";
import { organization } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const userId = session!.user.id;
  const orgId = session!.user.orgId;

  // Determine which key tier is active so the UI can explain the quota context
  const [org] = await db
    .select({ k: organization.anthropicApiKey })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);

  const hasOrgKey = !!org?.k;

  // Check user key by reading from DB (avoid decrypting — just check existence)
  const { userAccount } = await import("@/db/schema");
  const [user] = await db
    .select({ k: userAccount.anthropicApiKey })
    .from(userAccount)
    .where(eq(userAccount.id, userId))
    .limit(1);

  const hasUserKey = !!user?.k;

  // Only count usage when env key is the active tier
  if (hasOrgKey || hasUserKey || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      used: null,
      limit: null,
      remaining: null,
      activeKeyTier: hasOrgKey ? "org" : hasUserKey ? "user" : "none",
    });
  }

  const usage = await getEnvKeyUsage(userId);
  return NextResponse.json({ ...usage, activeKeyTier: "env" });
}
