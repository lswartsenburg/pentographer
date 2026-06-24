import Anthropic from "@anthropic-ai/sdk";
import { eq, and, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { userAccount, organization, aiUsageLog } from "@/db/schema";
import { decrypt } from "@/lib/crypto";

export const AI_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const ENV_AI_DAILY_LIMIT = Number(process.env.ENV_AI_DAILY_LIMIT ?? "10");

export async function getEnvKeyUsage(
  userId: string
): Promise<{ used: number; limit: number; remaining: number }> {
  const since = new Date(Date.now() - 86_400_000);
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(aiUsageLog)
    .where(and(eq(aiUsageLog.userId, userId), gte(aiUsageLog.createdAt, since)));
  return {
    used: count,
    limit: ENV_AI_DAILY_LIMIT,
    remaining: Math.max(0, ENV_AI_DAILY_LIMIT - count),
  };
}

export async function getAnthropicClient(
  orgId?: string | null,
  userId?: string | null
): Promise<Anthropic | null> {
  // 1. Org key
  if (orgId) {
    const [org] = await db
      .select({ k: organization.anthropicApiKey })
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1);
    if (org?.k) return new Anthropic({ apiKey: decrypt(org.k) });
  }

  // 2. User key
  if (userId) {
    const [user] = await db
      .select({ k: userAccount.anthropicApiKey })
      .from(userAccount)
      .where(eq(userAccount.id, userId))
      .limit(1);
    if (user?.k) return new Anthropic({ apiKey: decrypt(user.k) });
  }

  // 3. Env var with per-user daily rate limit
  if (process.env.ANTHROPIC_API_KEY) {
    if (userId) {
      const since = new Date(Date.now() - 86_400_000);
      const [{ count }] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(aiUsageLog)
        .where(and(eq(aiUsageLog.userId, userId), gte(aiUsageLog.createdAt, since)));
      if (count >= ENV_AI_DAILY_LIMIT) return null;
      await db.insert(aiUsageLog).values({ userId, orgId: orgId ?? null });
    }
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  return null;
}
