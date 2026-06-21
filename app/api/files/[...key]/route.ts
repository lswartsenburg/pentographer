import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getStorage } from "@/lib/storage";

// Serves files from local storage. Only reachable when STORAGE_BACKEND=local.
// Vercel Blob files are served directly from Vercel's CDN and never hit this route.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { error } = await requireAuth();
  if (error) return error;

  const { key } = await params;
  const storageKey = key.join("/");

  try {
    const { body, contentType } = await getStorage().get(storageKey);
    return new NextResponse(body as unknown as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
