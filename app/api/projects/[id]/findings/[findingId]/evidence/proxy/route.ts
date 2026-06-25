import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { project, finding } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; findingId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: projectId, findingId } = await params;

  const [proj] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, session!.user.id)))
    .limit(1);
  if (!proj) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [f] = await db
    .select({ id: finding.id })
    .from(finding)
    .where(and(eq(finding.id, findingId), eq(finding.projectId, projectId)))
    .limit(1);
  if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = request.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  // Local storage files are served directly via /api/files/... — no proxy needed
  if (url.startsWith("/api/files/")) {
    return NextResponse.redirect(new URL(url, request.url));
  }

  // Vercel Blob: validate hostname before proxying
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (!parsed.hostname.endsWith(".blob.vercel-storage.com")) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return NextResponse.json({ error: "Storage not configured" }, { status: 503 });

  const upstream = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!upstream.ok) {
    return NextResponse.json({ error: "Blob not found" }, { status: upstream.status });
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const contentLength = upstream.headers.get("content-length");

  // These types are safe to display inline in an <img> tag. Everything else
  // (SVG, HTML, XML, unknown) forces a download so it can't execute in the
  // app's origin if a user navigates to the proxy URL directly.
  const SAFE_INLINE = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]);
  const baseType = contentType.split(";")[0].trim();
  const attachment = !SAFE_INLINE.has(baseType);

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      ...(contentLength ? { "Content-Length": contentLength } : {}),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      ...(attachment ? { "Content-Disposition": "attachment" } : {}),
    },
  });
}
