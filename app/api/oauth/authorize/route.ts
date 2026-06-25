import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { oauthClient, oauthAuthCode } from "@/db/schema";
import { auth } from "@/auth";

const CODE_TTL_SECONDS = 300; // 5 minutes

function errorRedirect(redirectUri: string, error: string, state?: string | null): NextResponse {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (state) url.searchParams.set("state", state);
  return NextResponse.redirect(url.toString());
}

function consentHtml(clientName: string, params: Record<string, string>): NextResponse {
  const fields = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${v.replace(/"/g, "&quot;")}" />`)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Authorize — Pentographer</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0f1117;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #1a1f2e;
      border: 1px solid #2d3748;
      border-radius: 12px;
      padding: 2rem;
      width: 100%;
      max-width: 420px;
      text-align: center;
    }
    .logo { font-size: 1.25rem; font-weight: 600; color: #fff; margin-bottom: 1.5rem; }
    .logo span { color: #6366f1; }
    h1 { font-size: 1.1rem; font-weight: 500; margin-bottom: 0.5rem; }
    .client-name {
      font-size: 1.25rem;
      font-weight: 700;
      color: #fff;
      margin: 0.75rem 0;
    }
    p { font-size: 0.875rem; color: #94a3b8; margin-bottom: 1.5rem; }
    .permissions {
      background: #111827;
      border: 1px solid #2d3748;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1.5rem;
      text-align: left;
    }
    .permissions p { margin-bottom: 0.5rem; font-size: 0.8rem; color: #64748b; }
    .permissions ul { list-style: none; }
    .permissions li {
      font-size: 0.875rem;
      color: #cbd5e1;
      padding: 0.25rem 0;
      padding-left: 1.25rem;
      position: relative;
    }
    .permissions li::before { content: "✓"; position: absolute; left: 0; color: #22c55e; }
    .actions { display: flex; gap: 0.75rem; }
    button {
      flex: 1;
      padding: 0.625rem 1rem;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: opacity 0.15s;
    }
    button:hover { opacity: 0.85; }
    .btn-allow { background: #6366f1; color: #fff; }
    .btn-deny { background: #1e293b; color: #94a3b8; border: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Pento<span>grapher</span></div>
    <h1>Authorize access</h1>
    <div class="client-name">${clientName.replace(/</g, "&lt;")}</div>
    <p>is requesting access to your Pentographer account.</p>
    <div class="permissions">
      <p>This will allow the application to:</p>
      <ul>
        <li>Read and create projects and findings</li>
        <li>Read and manage playbooks</li>
        <li>Add evidence notes to findings</li>
      </ul>
    </div>
    <form method="POST" action="/api/oauth/authorize" class="actions">
      ${fields}
      <button type="submit" name="action" value="deny" class="btn-deny">Deny</button>
      <button type="submit" name="action" value="allow" class="btn-allow">Allow</button>
    </form>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const responseType = searchParams.get("response_type");
  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const state = searchParams.get("state");
  const codeChallenge = searchParams.get("code_challenge");
  const codeChallengeMethod = searchParams.get("code_challenge_method") ?? "S256";

  if (responseType !== "code" || !clientId || !redirectUri) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const [client] = await db
    .select({ id: oauthClient.id, name: oauthClient.name })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
    .limit(1);

  if (!client) {
    return NextResponse.json({ error: "invalid_client" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    const callbackUrl = req.url;
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`, req.url)
    );
  }

  const params: Record<string, string> = {
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge_method: codeChallengeMethod,
  };
  if (state) params.state = state;
  if (codeChallenge) params.code_challenge = codeChallenge;

  return consentHtml(client.name, params);
}

export async function POST(req: NextRequest) {
  const body = await req.formData();
  const action = body.get("action") as string | null;
  const clientId = body.get("client_id") as string | null;
  const redirectUri = body.get("redirect_uri") as string | null;
  const state = body.get("state") as string | null;
  const codeChallenge = body.get("code_challenge") as string | null;
  const codeChallengeMethod = (body.get("code_challenge_method") as string | null) ?? "S256";

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (action === "deny") {
    return errorRedirect(redirectUri, "access_denied", state);
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [client] = await db
    .select({ organizationId: oauthClient.organizationId })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
    .limit(1);

  if (!client) {
    return errorRedirect(redirectUri, "invalid_client", state);
  }

  const code = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000);

  await db.insert(oauthAuthCode).values({
    code,
    clientId,
    userId: session.user.id,
    organizationId: client.organizationId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    expiresAt,
  });

  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
