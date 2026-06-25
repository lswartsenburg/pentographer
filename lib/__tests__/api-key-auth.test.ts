import crypto from "crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organization, userAccount, apiKey, oauthClient } from "@/db/schema";
import { requireApiKey } from "@/lib/api-key-auth";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TAG = crypto.randomBytes(4).toString("hex");
const RAW_API_KEY = `ptg_test_${TAG}`;
const API_KEY_HASH = crypto.createHash("sha256").update(RAW_API_KEY).digest("hex");
const OAUTH_CLIENT_ID = `test-client-${TAG}`;
const OAUTH_CLIENT_SECRET = "test-secret";
const OAUTH_SECRET_HASH = crypto.createHash("sha256").update(OAUTH_CLIENT_SECRET).digest("hex");

let orgId: string;
let userId: string;
let apiKeyDbId: string;
let oauthClientDbId: string;

beforeAll(async () => {
  const [org] = await db
    .insert(organization)
    .values({ name: `Auth Test Org ${TAG}` })
    .returning();
  orgId = org.id;

  const [user] = await db
    .insert(userAccount)
    .values({
      name: "Auth Test User",
      email: `auth-test-${TAG}@example.com`,
      passwordHash: "unused",
      personalOrgId: orgId,
    })
    .returning();
  userId = user.id;

  const [key] = await db
    .insert(apiKey)
    .values({ organizationId: orgId, userId, name: "Test Key", keyHash: API_KEY_HASH })
    .returning();
  apiKeyDbId = key.id;

  const [client] = await db
    .insert(oauthClient)
    .values({
      organizationId: orgId,
      userId,
      name: "Test OAuth Client",
      clientId: OAUTH_CLIENT_ID,
      clientSecretHash: OAUTH_SECRET_HASH,
    })
    .returning();
  oauthClientDbId = client.id;
});

afterAll(async () => {
  await db.delete(oauthClient).where(eq(oauthClient.id, oauthClientDbId));
  await db.delete(apiKey).where(eq(apiKey.id, apiKeyDbId));
  await db.delete(userAccount).where(eq(userAccount.id, userId));
  await db.delete(organization).where(eq(organization.id, orgId));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bearerRequest(token: string): NextRequest {
  return new NextRequest("http://localhost/api/graphql", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function noAuthRequest(): NextRequest {
  return new NextRequest("http://localhost/api/graphql");
}

async function signJwt(claims: Record<string, string>, expiresIn = "1h"): Promise<string> {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(secret));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("requireApiKey — no auth", () => {
  it("rejects requests with no Authorization header", async () => {
    const result = await requireApiKey(noAuthRequest());
    expect(result.error).not.toBeNull();
    expect(result.error!.status).toBe(401);
  });
});

describe("requireApiKey — ptg_ API key", () => {
  it("accepts a valid ptg_ key and returns userId + orgId", async () => {
    const result = await requireApiKey(bearerRequest(RAW_API_KEY));
    expect(result.error).toBeNull();
    expect(result.userId).toBe(userId);
    expect(result.orgId).toBe(orgId);
  });

  it("rejects an unknown ptg_ key", async () => {
    const result = await requireApiKey(bearerRequest("ptg_totally_unknown_key"));
    expect(result.error).not.toBeNull();
    expect(result.error!.status).toBe(401);
  });

  it("rejects an expired ptg_ key", async () => {
    const expiredKeyRaw = `ptg_expired_${TAG}`;
    const expiredHash = crypto.createHash("sha256").update(expiredKeyRaw).digest("hex");
    const [expKey] = await db
      .insert(apiKey)
      .values({
        organizationId: orgId,
        userId,
        name: "Expired Key",
        keyHash: expiredHash,
        expiresAt: new Date(Date.now() - 1000),
      })
      .returning();

    try {
      const result = await requireApiKey(bearerRequest(expiredKeyRaw));
      expect(result.error).not.toBeNull();
      expect(result.error!.status).toBe(401);
    } finally {
      await db.delete(apiKey).where(eq(apiKey.id, expKey.id));
    }
  });
});

describe("requireApiKey — user-delegated JWT (authorization_code flow)", () => {
  it("accepts a uid+oid token and returns the user's id and org", async () => {
    const token = await signJwt({ uid: userId, oid: orgId });
    const result = await requireApiKey(bearerRequest(token));
    expect(result.error).toBeNull();
    expect(result.userId).toBe(userId);
    expect(result.orgId).toBe(orgId);
  });

  it("rejects a uid+oid token signed with the wrong secret", async () => {
    const badToken = await new SignJWT({ uid: userId, oid: orgId })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("wrong-secret"));

    const result = await requireApiKey(bearerRequest(badToken));
    expect(result.error).not.toBeNull();
    expect(result.error!.status).toBe(401);
  });

  it("rejects an expired uid+oid token", async () => {
    const token = await signJwt({ uid: userId, oid: orgId }, "-1s");
    const result = await requireApiKey(bearerRequest(token));
    expect(result.error).not.toBeNull();
    expect(result.error!.status).toBe(401);
  });
});

describe("requireApiKey — OAuth client JWT (client_credentials flow)", () => {
  it("accepts a cid+oid token and returns client userId + orgId", async () => {
    const token = await signJwt({ cid: OAUTH_CLIENT_ID, oid: orgId });
    const result = await requireApiKey(bearerRequest(token));
    expect(result.error).toBeNull();
    expect(result.orgId).toBe(orgId);
    expect(result.userId).toBe(userId);
  });

  it("rejects a cid token where the client does not exist", async () => {
    const token = await signJwt({ cid: "nonexistent-client", oid: orgId });
    const result = await requireApiKey(bearerRequest(token));
    expect(result.error).not.toBeNull();
    expect(result.error!.status).toBe(401);
  });
});

describe("requireApiKey — malformed tokens", () => {
  it("rejects garbage in the Authorization header", async () => {
    const result = await requireApiKey(bearerRequest("not.a.valid.jwt"));
    expect(result.error).not.toBeNull();
    expect(result.error!.status).toBe(401);
  });

  it("rejects a JWT missing both uid and cid claims", async () => {
    const token = await signJwt({ something: "else" });
    const result = await requireApiKey(bearerRequest(token));
    expect(result.error).not.toBeNull();
    expect(result.error!.status).toBe(401);
  });
});
