import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = Buffer.alloc(32, 7).toString("base64");

beforeEach(() => {
  vi.stubEnv("APP_ENCRYPTION_KEY", KEY);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("encrypt / decrypt", () => {
  it("round trips and never repeats the ciphertext", async () => {
    const { encrypt, decrypt } = await import("./crypto");
    const a = encrypt("fat_secret");
    expect(decrypt(a)).toBe("fat_secret");
    expect(encrypt("fat_secret")).not.toBe(a);
    expect(a).not.toContain("fat_secret");
  });

  it("rejects tampered data", async () => {
    const { encrypt, decrypt } = await import("./crypto");
    const data = Buffer.from(encrypt("hello"), "base64");
    data[data.length - 1] = data[data.length - 1]! ^ 1;
    expect(() => decrypt(data.toString("base64"))).toThrow();
  });

  it("needs a 32 byte key", async () => {
    vi.stubEnv("APP_ENCRYPTION_KEY", Buffer.alloc(16, 1).toString("base64").padEnd(40, "A"));
    const { encrypt } = await import("./crypto");
    expect(() => encrypt("x")).toThrow(/32 bytes/);
  });
});

describe("connect state", () => {
  it("verifies a fresh state", async () => {
    const { signState, verifyState } = await import("./crypto");
    const state = signState({ accountId: "g1", ownerId: "u1" });
    expect(verifyState(state)).toEqual({ accountId: "g1", ownerId: "u1" });
  });

  it("rejects expired, tampered and malformed states", async () => {
    const { signState, verifyState } = await import("./crypto");
    const now = Date.now();
    const state = signState({ accountId: "g1", ownerId: "u1" }, now);
    expect(verifyState(state, now + 11 * 60 * 1000)).toBeNull();
    const [body, sig] = state.split(".");
    const forged = Buffer.from(JSON.stringify({ g: "g2", o: "u1", e: now + 60_000, n: "x" })).toString("base64url");
    expect(verifyState(`${forged}.${sig}`, now)).toBeNull();
    expect(verifyState(`${body}.AAAA`, now)).toBeNull();
    expect(verifyState("garbage", now)).toBeNull();
    expect(verifyState(null)).toBeNull();
  });
});
