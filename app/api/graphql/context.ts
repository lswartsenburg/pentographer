import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-key-auth";

export type GraphQLContext = {
  userId: string;
};

export async function buildContext(req: NextRequest): Promise<GraphQLContext | NextResponse> {
  const result = await requireApiKey(req);
  if (result.error) return result.error;
  return { userId: result.userId };
}
