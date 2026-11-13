import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getEnv } from "./env";

function key(): Buffer {
  const raw = getEnv().APP_ENCRYPTION_KEY;
  if (!raw) throw new Error("APP_ENCRYPTION_KEY is not set");
  const buffer = Buffer.from(raw, "base64");
  if (buffer.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  return buffer;
}

/** AES-256-GCM. Output: base64(iv | tag | ciphertext). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decrypt(payload: string): string {
  const data = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}

const STATE_TTL_MS = 10 * 60 * 1000;

function mac(body: string): string {
  return createHmac("sha256", key()).update(`festie-connect-state.${body}`).digest("base64url");
}

export interface ConnectState {
  accountId: string;
  ownerId: string;
}

/** Signed, expiring `state` for the connect round trip. Not stored: the signature is the proof. */
export function signState(state: ConnectState, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ g: state.accountId, o: state.ownerId, e: now + STATE_TTL_MS, n: randomBytes(8).toString("hex") })).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function verifyState(value: string | null | undefined, now = Date.now()): ConnectState | null {
  if (!value) return null;
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(mac(body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { g?: string; o?: string; e?: number };
    if (!parsed.g || !parsed.o || !parsed.e || parsed.e < now) return null;
    return { accountId: parsed.g, ownerId: parsed.o };
  } catch {
    return null;
  }
}
