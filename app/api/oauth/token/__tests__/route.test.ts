import crypto from "crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { db } from "@/db/client";
import { organization, userAccount, oauthClient, oauthAuthCode } from "@/db/schema";
import { POST } from "../route";

// ─── Test fixtures ────────────────────────────────────────────────────────────

const TEST_CLIENT_ID = `test-oauth-${crypto.randomBytes(4).toString("hex")}`;
const TEST_CLIENT_SECRET = "super-secret-test-value";
const TEST_SECRET_HASH = crypto.createHash("sha256").update(TEST_CLIENT_SECRET).digest("hex");

const REDIRECT_URI = "https://claude.ai/api/mcp/auth/callback";

let orgId: string;
let userId: string;
let clientDbId: string;

beforeAll(async () => {
  const [org] = await db
    .insert(organization)
    .values({ name: "Test Org (token route)" })
    .returning();
  orgId = org.id;

  const [user] = await db
    .insert(userAccount)
    .values({
      name: "Token Test User",
      email: `token-test-${crypto.randomBytes(4).toString("hex")}@example.com`,
      passwordHash: "unused",
      personalOrgId: orgId,
    })
    .returning();
  userId = user.id;

  const [client] = await db
    .insert(oauthClient)
    .values({
      organizationId: orgId,
      userId,
      name: "Test Client",
      clientId: TEST_CLIENT_ID,
      clientSecretHash: TEST_SECRET_HASH,
    })
    .returning();
  clientDbId = client.id;
});

afterAll(async () => {
  await db.delete(oauthAuthCode).where(eq(oauthAuthCode.clientId, TEST_CLIENT_ID));
  await db.delete(oauthClient).where(eq(oauthClient.id, clientDbId));
  await db.delete(userAccount).where(eq(userAccount.id, userId));
  await db.delete(organization).where(eq(organization.id, orgId));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formRequest(body: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/oauth/token", {
    method: "POST",
    body: new URLSearchParams(body).toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}

/** PKCE helpers */
function pkceVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}
function pkceChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

async function insertAuthCode(overrides: {
  code?: string;
  redirectUri?: string;
  codeChallenge?: string | null;
  codeChallengeMethod?: string;
  expiresAt?: Date;
  usedAt?: Date | null;
}) {
  const code = overrides.code ?? crypto.randomBytes(32).toString("hex");
  await db.insert(oauthAuthCode).values({
    code,
    clientId: TEST_CLIENT_ID,
    userId,
    organizationId: orgId,
    redirectUri: overrides.redirectUri ?? REDIRECT_URI,
    codeChallenge: overrides.codeChallenge ?? null,
    codeChallengeMethod: overrides.codeChallengeMethod ?? "S256",
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
    usedAt: overrides.usedAt ?? null,
  });
  return code;
}

async function verifyJwt(token: string) {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: ["HS256"],
  });
  return payload;
}

// ─── client_credentials ───────────────────────────────────────────────────────

describe("client_credentials grant", () => {
  it("returns an access token for valid credentials", async () => {
    const res = await POST(
      formRequest({
        grant_type: "client_credentials",
        client_id: TEST_CLIENT_ID,
        client_secret: TEST_CLIENT_SECRET,
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.access_token).toBeDefined();
    expect(body.token_type).toBe("Bearer");
    expect(body.expires_in).toBe(3600);

    const payload = await verifyJwt(body.access_token);
    expect(payload.oid).toBe(orgId);
    expect(payload.cid).toBe(TEST_CLIENT_ID);
  });

  it("rejects wrong client_secret", async () => {
    const res = await POST(
      formRequest({
        grant_type: "client_credentials",
        client_id: TEST_CLIENT_ID,
        client_secret: "wrong-secret",
      })
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_client");
  });

  it("rejects unknown client_id", async () => {
    const res = await POST(
      formRequest({
        grant_type: "client_credentials",
        client_id: "nonexistent-client",
        client_secret: TEST_CLIENT_SECRET,
      })
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_client");
  });

  it("rejects missing credentials", async () => {
    const res = await POST(formRequest({ grant_type: "client_credentials" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_request");
  });
});

// ─── authorization_code grant ─────────────────────────────────────────────────

describe("authorization_code grant", () => {
  it("returns a user-delegated access token for valid code", async () => {
    const verifier = pkceVerifier();
    const challenge = pkceChallenge(verifier);
    const code = await insertAuthCode({ codeChallenge: challenge });

    const res = await POST(
      formRequest({
        grant_type: "authorization_code",
        code,
        client_id: TEST_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.access_token).toBeDefined();
    expect(body.token_type).toBe("Bearer");

    const payload = await verifyJwt(body.access_token);
    expect(payload.uid).toBe(userId);
    expect(payload.oid).toBe(orgId);
  });

  it("marks the code used — second use is rejected", async () => {
    const verifier = pkceVerifier();
    const code = await insertAuthCode({ codeChallenge: pkceChallenge(verifier) });
    const params = {
      grant_type: "authorization_code",
      code,
      client_id: TEST_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    };

    const first = await POST(formRequest(params));
    expect(first.status).toBe(200);

    const second = await POST(formRequest(params));
    expect(second.status).toBe(401);
    expect((await second.json()).error).toBe("invalid_grant");
  });

  it("rejects expired code", async () => {
    const verifier = pkceVerifier();
    const code = await insertAuthCode({
      codeChallenge: pkceChallenge(verifier),
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await POST(
      formRequest({
        grant_type: "authorization_code",
        code,
        client_id: TEST_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      })
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_grant");
  });

  it("rejects wrong redirect_uri", async () => {
    const verifier = pkceVerifier();
    const code = await insertAuthCode({ codeChallenge: pkceChallenge(verifier) });

    const res = await POST(
      formRequest({
        grant_type: "authorization_code",
        code,
        client_id: TEST_CLIENT_ID,
        redirect_uri: "https://attacker.example.com/callback",
        code_verifier: verifier,
      })
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_grant");
  });

  it("rejects wrong client_id", async () => {
    const verifier = pkceVerifier();
    const code = await insertAuthCode({ codeChallenge: pkceChallenge(verifier) });

    const res = await POST(
      formRequest({
        grant_type: "authorization_code",
        code,
        client_id: "wrong-client",
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      })
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_grant");
  });

  it("rejects invalid code_verifier (PKCE mismatch)", async () => {
    const verifier = pkceVerifier();
    const code = await insertAuthCode({ codeChallenge: pkceChallenge(verifier) });

    const res = await POST(
      formRequest({
        grant_type: "authorization_code",
        code,
        client_id: TEST_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: pkceVerifier(), // different verifier
      })
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_grant");
  });

  it("rejects missing code_verifier when challenge is set", async () => {
    const code = await insertAuthCode({ codeChallenge: pkceChallenge(pkceVerifier()) });

    const res = await POST(
      formRequest({
        grant_type: "authorization_code",
        code,
        client_id: TEST_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        // no code_verifier
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_request");
  });

  it("rejects unknown code", async () => {
    const res = await POST(
      formRequest({
        grant_type: "authorization_code",
        code: "totally-made-up-code",
        client_id: TEST_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: pkceVerifier(),
      })
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_grant");
  });

  it("rejects missing required fields", async () => {
    const res = await POST(formRequest({ grant_type: "authorization_code", code: "x" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_request");
  });
});

// ─── unsupported grant type ───────────────────────────────────────────────────

describe("unsupported grant types", () => {
  it("returns unsupported_grant_type for unknown grant", async () => {
    const res = await POST(formRequest({ grant_type: "password" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unsupported_grant_type");
  });

  it("returns unsupported_grant_type when grant_type is missing", async () => {
    const res = await POST(formRequest({ client_id: TEST_CLIENT_ID }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unsupported_grant_type");
  });
});
