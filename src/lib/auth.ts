import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { getEnv, googleEnabled, requireAuthSecret } from "@/lib/env";

function createAuth() {
  return betterAuth({
    secret: requireAuthSecret(),
    baseURL: getEnv().BETTER_AUTH_URL,
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    // No email service yet: sign up signs the user straight in, no verification mail.
    emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
    ...(googleEnabled()
      ? {
          socialProviders: {
            google: { clientId: getEnv().GOOGLE_CLIENT_ID!, clientSecret: getEnv().GOOGLE_CLIENT_SECRET! },
          },
        }
      : {}),
    // Password accounts are not email-verified, so a Google login must never be merged into an
    // existing account with the same email (that would let someone pre-register a victim's email).
    account: { accountLinking: { enabled: false } },
    plugins: [nextCookies()],
  });
}

let auth: ReturnType<typeof createAuth> | undefined;

/** Lazy so importing this file never needs secrets (builds, tests). */
export function getAuth() {
  auth ??= createAuth();
  return auth;
}
