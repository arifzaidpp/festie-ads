import { createHmac, timingSafeEqual } from "node:crypto";

/** Headers festie sends on every call to this engine. */
export const SIGNATURE_HEADERS = {
  app: "x-ads-app",
  timestamp: "x-ads-timestamp",
  signature: "x-ads-signature",
} as const;

export const MAX_SKEW_MS = 5 * 60 * 1000;

/**
 * `base64(HMAC_SHA256(secret, "<timestamp>.<METHOD>.<path?query>.<body>"))`.
 * The method, path and query are signed, so a captured signature cannot be reused for another request.
 */
export function signRequest(secret: string, timestamp: string, method: string, pathWithQuery: string, body = ""): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${method.toUpperCase()}.${pathWithQuery}.${body}`)
    .digest("base64");
}

export function verifyRequest(input: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  method: string;
  pathWithQuery: string;
  body?: string;
  now?: number;
}): boolean {
  const { secret, timestamp, signature } = input;
  if (!timestamp || !signature) return false;
  const sent = Number(timestamp);
  if (!Number.isFinite(sent) || Math.abs((input.now ?? Date.now()) - sent) > MAX_SKEW_MS) return false;
  const expected = Buffer.from(signRequest(secret, timestamp, input.method, input.pathWithQuery, input.body ?? ""));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
