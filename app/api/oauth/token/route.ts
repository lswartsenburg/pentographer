import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { SignJWT } from "jose";
import { db } from "@/db/client";
import { oauthClient, oauthAuthCode } from "@/db/schema";

const TOKEN_TTL = 3600; // 1 hour

function err(code: string, description?: string, status = 400) {
  return NextResponse.json(
    { error: code, ...(description ? { error_description: description } : {}) },
    { status }
  );
}

async function issueToken(
  subject: string,
  claims: Record<string, string>,
  authSecret: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subject)
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_TTL)
    .sign(new TextEncoder().encode(authSecret));
}

export async function POST(req: NextRequest) {
  // Parse body — accept both form-encoded and JSON
  let grantType: string | null = null;
  let clientId: string | null = null;
  let clientSecret: string | null = null;
  let code: string | null = null;
  let codeVerifier: string | null = null;
  let redirectUri: string | null = null;

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const body = await req.formData();
    grantType = body.get("grant_type") as string | null;
    clientId = body.get("client_id") as string | null;
    clientSecret = body.get("client_secret") as string | null;
    code = body.get("code") as string | null;
    codeVerifier = body.get("code_verifier") as string | null;
    redirectUri = body.get("redirect_uri") as string | null;
  } else {
    const body = await req.json().catch(() => ({}));
    grantType = body.grant_type ?? null;
    clientId = body.client_id ?? null;
    clientSecret = body.client_secret ?? null;
    code = body.code ?? null;
    codeVerifier = body.code_verifier ?? null;
    redirectUri = body.redirect_uri ?? null;
  }

  // Also accept client credentials from Basic auth header
  if (!clientId || !clientSecret) {
    const basic = req.headers.get("authorization");
    if (basic?.startsWith("Basic ")) {
      const decoded = Buffer.from(basic.slice(6), "base64").toString("utf-8");
      const sep = decoded.indexOf(":");
      if (sep !== -1) {
        clientId = clientId ?? decoded.slice(0, sep);
        clientSecret = clientSecret ?? decoded.slice(sep + 1);
      }
    }
  }

  const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!authSecret) return err("server_error", undefined, 500);

  // ── authorization_code grant ──────────────────────────────────────────────
  if (grantType === "authorization_code") {
    if (!code || !redirectUri || !clientId) {
      return err("invalid_request", "code, redirect_uri, and client_id are required");
    }

    const [authCode] = await db
      .select()
      .from(oauthAuthCode)
      .where(eq(oauthAuthCode.code, code))
      .limit(1);

    if (!authCode) return err("invalid_grant", "Unknown authorization code", 401);
    if (authCode.usedAt) return err("invalid_grant", "Authorization code already used", 401);
    if (authCode.expiresAt < new Date())
      return err("invalid_grant", "Authorization code expired", 401);
    if (authCode.clientId !== clientId) return err("invalid_grant", "client_id mismatch", 401);
    if (authCode.redirectUri !== redirectUri)
      return err("invalid_grant", "redirect_uri mismatch", 401);

    // Verify PKCE
    if (authCode.codeChallenge) {
      if (!codeVerifier) return err("invalid_request", "code_verifier required");
      const method = authCode.codeChallengeMethod ?? "S256";
      if (method === "S256") {
        const digest = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
        if (digest !== authCode.codeChallenge) {
          return err("invalid_grant", "PKCE verification failed", 401);
        }
      }
    }

    // Mark code used
    await db
      .update(oauthAuthCode)
      .set({ usedAt: new Date() })
      .where(eq(oauthAuthCode.id, authCode.id));

    // Issue token scoped to the authorizing user's org
    const accessToken = await issueToken(
      authCode.userId,
      { uid: authCode.userId, oid: authCode.organizationId },
      authSecret
    );

    return NextResponse.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: TOKEN_TTL,
    });
  }

  // ── client_credentials grant ──────────────────────────────────────────────
  if (grantType === "client_credentials") {
    if (!clientId || !clientSecret) {
      return err("invalid_request", "client_id and client_secret are required");
    }

    const secretHash = crypto.createHash("sha256").update(clientSecret).digest("hex");

    const [client] = await db
      .select()
      .from(oauthClient)
      .where(and(eq(oauthClient.clientId, clientId), eq(oauthClient.clientSecretHash, secretHash)))
      .limit(1);

    if (!client) return err("invalid_client", undefined, 401);

    const accessToken = await issueToken(
      client.clientId,
      { cid: client.clientId, oid: client.organizationId },
      authSecret
    );

    db.update(oauthClient).set({ lastUsedAt: new Date() }).where(eq(oauthClient.id, client.id));

    return NextResponse.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: TOKEN_TTL,
    });
  }

  return err("unsupported_grant_type");
}
