import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { encrypt, decrypt } from "../crypto";

const ORIGINAL_AUTH_SECRET = process.env.AUTH_SECRET;

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-for-unit-tests-only";
});

afterAll(() => {
  process.env.AUTH_SECRET = ORIGINAL_AUTH_SECRET;
});

describe("encrypt / decrypt", () => {
  it("round-trips plaintext correctly", () => {
    const plaintext = "sk-ant-api03-supersecretkey";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("round-trips empty string", () => {
    expect(decrypt(encrypt(""))).toBe("");
  });

  it("round-trips unicode content", () => {
    const unicode = "こんにちは 🔐 café";
    expect(decrypt(encrypt(unicode))).toBe(unicode);
  });

  it("produces different ciphertexts for the same input (random IV)", () => {
    const plaintext = "same-input";
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext));
  });

  it("ciphertext has three colon-separated hex parts", () => {
    const parts = encrypt("test").split(":");
    expect(parts).toHaveLength(3);
    parts.forEach((p) => expect(p).toMatch(/^[0-9a-f]+$/));
  });

  it("throws on invalid ciphertext format", () => {
    expect(() => decrypt("notvalid")).toThrow("Invalid ciphertext format");
    expect(() => decrypt("a:b")).toThrow("Invalid ciphertext format");
  });

  it("throws when AUTH_SECRET is missing", () => {
    const saved = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    expect(() => encrypt("x")).toThrow("AUTH_SECRET is required");
    process.env.AUTH_SECRET = saved;
  });
});
