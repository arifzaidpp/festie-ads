import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("env", () => {
  it("allows a missing DATABASE_URL until it is required", async () => {
    vi.stubEnv("DATABASE_URL", "");
    delete process.env.DATABASE_URL;
    const { getEnv, requireDatabaseUrl } = await import("./env");
    expect(getEnv().DATABASE_URL).toBeUndefined();
    expect(() => requireDatabaseUrl()).toThrow("DATABASE_URL is not set");
  });

  it("rejects a malformed DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "not-a-url");
    const { getEnv } = await import("./env");
    expect(() => getEnv()).toThrow();
  });

  it("treats blank values as not set", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("FESTIE_CLIENT_ID", "");
    vi.stubEnv("S3_ENDPOINT", "");
    const { getEnv } = await import("./env");
    const env = getEnv();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.FESTIE_CLIENT_ID).toBeUndefined();
    expect(env.S3_ENDPOINT).toBeUndefined();
  });
});

describe("googleEnabled", () => {
  it("needs both credentials", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    let mod = await import("./env");
    expect(mod.googleEnabled()).toBe(false);
    vi.resetModules();
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    mod = await import("./env");
    expect(mod.googleEnabled()).toBe(true);
  });
});
