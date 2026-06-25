import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist the mock db object so vi.mock factory can reference it
const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock("@/db/client", () => ({ db: mockDb }));
vi.mock("@/db/schema", () => ({ organizationMember: {} }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));

import { requireOrgRole, getOrgRole } from "../org-access";

const UID = "user-1";
const OID = "org-1";

function mockRole(role: string | null) {
  const limit = vi.fn().mockResolvedValue(role ? [{ role }] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  mockDb.select.mockReturnValue({ from });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOrgRole", () => {
  it("returns the user's role when they are a member", async () => {
    mockRole("admin");
    expect(await getOrgRole(UID, OID)).toBe("admin");
  });

  it("returns null when the user is not a member", async () => {
    mockRole(null);
    expect(await getOrgRole(UID, OID)).toBeNull();
  });
});

describe("requireOrgRole", () => {
  it("returns true when role meets the minimum", async () => {
    mockRole("admin");
    expect(await requireOrgRole(UID, OID, "member")).toBe(true);
  });

  it("returns true when role exactly matches the minimum", async () => {
    mockRole("member");
    expect(await requireOrgRole(UID, OID, "member")).toBe(true);
  });

  it("returns false when role is below the minimum", async () => {
    mockRole("viewer");
    expect(await requireOrgRole(UID, OID, "admin")).toBe(false);
  });

  it("returns false when user is not a member", async () => {
    mockRole(null);
    expect(await requireOrgRole(UID, OID, "viewer")).toBe(false);
  });

  it("owner satisfies all role levels", async () => {
    for (const min of ["viewer", "member", "admin", "owner"] as const) {
      mockRole("owner");
      expect(await requireOrgRole(UID, OID, min)).toBe(true);
    }
  });

  it("viewer satisfies only viewer", async () => {
    mockRole("viewer");
    expect(await requireOrgRole(UID, OID, "viewer")).toBe(true);
    mockRole("viewer");
    expect(await requireOrgRole(UID, OID, "member")).toBe(false);
    mockRole("viewer");
    expect(await requireOrgRole(UID, OID, "admin")).toBe(false);
    mockRole("viewer");
    expect(await requireOrgRole(UID, OID, "owner")).toBe(false);
  });
});
