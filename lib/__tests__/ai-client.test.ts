import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/db/client", () => ({ db: mockDb }));
vi.mock("@/db/schema", () => ({ organization: {}, userAccount: {}, aiUsageLog: {} }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), gte: vi.fn(), sql: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(function (
    this: { apiKey: string },
    opts: { apiKey: string }
  ) {
    this.apiKey = opts.apiKey;
  }),
}));
vi.mock("@/lib/crypto", () => ({ decrypt: (v: string) => `decrypted:${v}` }));

import { getAnthropicClient } from "../ai/client";

const ORG_ID = "org-1";
const USER_ID = "user-1";

// Returns a where result that is both awaitable and has .limit()
function makeWhere(rows: unknown[]) {
  const p = Promise.resolve(rows);
  const whereResult = Object.assign(p, { limit: vi.fn().mockResolvedValue(rows) });
  return vi.fn().mockReturnValue(whereResult);
}

// Set up a chainable select mock that resolves to `rows`
function mockSelectReturning(rows: unknown[]) {
  const from = vi.fn().mockReturnValue({ where: makeWhere(rows) });
  mockDb.select.mockReturnValue({ from });
}

// Sequence of select results, one per call
function mockSelectSequence(sequence: unknown[][]) {
  let call = 0;
  mockDb.select.mockImplementation(() => {
    const rows = sequence[call++] ?? [];
    const from = vi.fn().mockReturnValue({ where: makeWhere(rows) });
    return { from };
  });
}

function mockInsert() {
  const returning = vi.fn().mockResolvedValue([]);
  const values = vi.fn().mockReturnValue({ returning });
  mockDb.insert.mockReturnValue({ values });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ENV_AI_DAILY_LIMIT;
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ENV_AI_DAILY_LIMIT;
});

describe("getAnthropicClient — key resolution hierarchy", () => {
  it("uses org key when org has one", async () => {
    mockSelectReturning([{ k: "org-enc-key" }]);
    const client = await getAnthropicClient(ORG_ID, USER_ID);
    expect((client as unknown as { apiKey: string })?.apiKey).toBe("decrypted:org-enc-key");
  });

  it("falls back to user key when org has no key", async () => {
    mockSelectSequence([[], [{ k: "user-enc-key" }]]);
    const client = await getAnthropicClient(ORG_ID, USER_ID);
    expect((client as unknown as { apiKey: string })?.apiKey).toBe("decrypted:user-enc-key");
  });

  it("falls back to env key when no personal keys are set", async () => {
    process.env.ANTHROPIC_API_KEY = "env-key";
    mockSelectSequence([[], [], [{ count: 0 }]]);
    mockInsert();
    const client = await getAnthropicClient(ORG_ID, USER_ID);
    expect((client as unknown as { apiKey: string })?.apiKey).toBe("env-key");
  });

  it("returns null when env key rate limit is reached", async () => {
    process.env.ANTHROPIC_API_KEY = "env-key";
    // Default limit is 10; count=10 meets the >= condition
    mockSelectSequence([[], [], [{ count: 10 }]]);
    const client = await getAnthropicClient(ORG_ID, USER_ID);
    expect(client).toBeNull();
  });

  it("returns null when no keys exist anywhere and no env key", async () => {
    mockSelectSequence([[], []]);
    const client = await getAnthropicClient(ORG_ID, USER_ID);
    expect(client).toBeNull();
  });

  it("returns env key client when called without orgId or userId", async () => {
    process.env.ANTHROPIC_API_KEY = "env-key";
    const client = await getAnthropicClient(null, null);
    expect((client as unknown as { apiKey: string })?.apiKey).toBe("env-key");
  });

  it("under the limit allows the call and logs usage", async () => {
    process.env.ANTHROPIC_API_KEY = "env-key";
    process.env.ENV_AI_DAILY_LIMIT = "10";
    mockSelectSequence([[], [], [{ count: 3 }]]);
    mockInsert();
    const client = await getAnthropicClient(ORG_ID, USER_ID);
    expect(client).not.toBeNull();
    expect(mockDb.insert).toHaveBeenCalledOnce();
  });
});
