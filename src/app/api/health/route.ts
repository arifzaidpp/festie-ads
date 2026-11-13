import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/** 200 when the app and (if configured) the database are up; 503 otherwise. */
export async function GET() {
  const env = getEnv();
  if (!env.DATABASE_URL) {
    // Only acceptable outside production, so a missing secret cannot go live unnoticed.
    const ok = env.NODE_ENV !== "production";
    return Response.json({ ok, db: "not_configured" }, { status: ok ? 200 : 503 });
  }
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true, db: "up" });
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}
