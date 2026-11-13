import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().optional(),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  /** 32 bytes, base64 (openssl rand -base64 32). Encrypts festie tokens and secrets at rest. */
  APP_ENCRYPTION_KEY: z.string().min(40).optional(),
  // Festie app registration (Control > Apps). The callback registered there must be
  // `${BETTER_AUTH_URL}/api/festie/callback`.
  FESTIE_ADMIN_URL: z.string().url().optional(),
  FESTIE_API_URL: z.string().url().optional(),
  FESTIE_CLIENT_ID: z.string().min(1).optional(),
  FESTIE_CLIENT_SECRET: z.string().min(1).optional(),
  /** Festie signs its calls to this engine with it (used from M4). Shown once in Control. */
  FESTIE_WEBHOOK_SECRET: z.string().min(1).optional(),
  /** Vercel Cron sends it as `Authorization: Bearer <value>` to /api/cron/*. Any long random string. */
  CRON_SECRET: z.string().min(16).optional(),
  // Optional Google sign in: both must be set. Authorized redirect URI in Google Cloud:
  // `${BETTER_AUTH_URL}/api/auth/callback/google`
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  // S3-compatible media bucket (Wasabi, R2, S3).
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  /** Public base URL of the bucket (CDN or bucket URL), no trailing slash. */
  S3_PUBLIC_BASE_URL: z.string().url().optional(),
  /** Prefix for every object key, so this app stays apart from other users of the bucket. */
  S3_KEY_PREFIX: z.string().default("festie-ads/"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Parsed env, read lazily so `next build` works without secrets. */
export function getEnv(): Env {
  // A blank value (as in a copied .env.example) means "not set".
  const present = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ""));
  cached ??= schema.parse(present);
  return cached;
}

/** The database URL, or a clear error when it is missing. */
export function requireDatabaseUrl(): string {
  const url = getEnv().DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

/** The auth secret, or a clear error when it is missing. */
export function requireAuthSecret(): string {
  const secret = getEnv().BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set (32+ characters)");
  return secret;
}

/** Google sign in is offered only when both credentials are set. */
export function googleEnabled(): boolean {
  const env = getEnv();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}
