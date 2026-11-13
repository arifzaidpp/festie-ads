import { describe, expect, it } from "vitest";
import { MAX_SKEW_MS, signRequest, verifyRequest } from "./signing";

const secret = "whsec_test";
const base = { secret, method: "GET", pathWithQuery: "/api/v1/serve?placement=SCREEN_FOOTER&external_ref=abc" };

describe("request signing", () => {
  it("accepts a correct signature", () => {
    const now = Date.now();
    const ts = String(now);
    const signature = signRequest(secret, ts, "GET", base.pathWithQuery);
    expect(verifyRequest({ ...base, timestamp: ts, signature, now })).toBe(true);
  });

  it("rejects a changed query, method, body, secret or signature", () => {
    const now = Date.now();
    const ts = String(now);
    const signature = signRequest(secret, ts, "GET", base.pathWithQuery);
    expect(verifyRequest({ ...base, pathWithQuery: base.pathWithQuery + "&exclude=x", timestamp: ts, signature, now })).toBe(false);
    expect(verifyRequest({ ...base, method: "POST", timestamp: ts, signature, now })).toBe(false);
    expect(verifyRequest({ ...base, body: "{}", timestamp: ts, signature, now })).toBe(false);
    expect(verifyRequest({ ...base, secret: "other", timestamp: ts, signature, now })).toBe(false);
    expect(verifyRequest({ ...base, timestamp: ts, signature: signature.slice(0, -2) + "xx", now })).toBe(false);
  });

  it("accepts a timestamp exactly at the skew limit and rejects one millisecond past it", () => {
    const now = 1_700_000_000_000;
    const atLimit = String(now - MAX_SKEW_MS);
    const pastLimit = String(now - MAX_SKEW_MS - 1);
    expect(verifyRequest({ ...base, timestamp: atLimit, signature: signRequest(secret, atLimit, "GET", base.pathWithQuery), now })).toBe(true);
    expect(verifyRequest({ ...base, timestamp: pastLimit, signature: signRequest(secret, pastLimit, "GET", base.pathWithQuery), now })).toBe(false);
  });

  it("signs a POST body: the same body passes, any change to it fails", () => {
    const now = Date.now();
    const ts = String(now);
    const body = '{"external_ref":"x","events":[]}';
    const post = { secret, method: "POST", pathWithQuery: "/api/v1/events", timestamp: ts, now };
    const signature = signRequest(secret, ts, "POST", post.pathWithQuery, body);
    expect(verifyRequest({ ...post, signature, body })).toBe(true);
    expect(verifyRequest({ ...post, signature, body: body.replace("x", "y") })).toBe(false);
    expect(verifyRequest({ ...post, signature, body: body + " " })).toBe(false);
    expect(verifyRequest({ ...post, signature, body: "" })).toBe(false);
  });

  it("rejects missing headers and stale or future timestamps", () => {
    const now = Date.now();
    const ts = String(now - MAX_SKEW_MS - 1000);
    const signature = signRequest(secret, ts, "GET", base.pathWithQuery);
    expect(verifyRequest({ ...base, timestamp: ts, signature, now })).toBe(false);
    const future = String(now + MAX_SKEW_MS + 1000);
    expect(verifyRequest({ ...base, timestamp: future, signature: signRequest(secret, future, "GET", base.pathWithQuery), now })).toBe(false);
    expect(verifyRequest({ ...base, timestamp: null, signature: "x", now })).toBe(false);
    expect(verifyRequest({ ...base, timestamp: "abc", signature: "x", now })).toBe(false);
  });
});
