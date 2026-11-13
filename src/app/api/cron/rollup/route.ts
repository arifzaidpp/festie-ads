import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { purgeOldEvents } from "@/server/retention";
import { isDay, refreshActiveConnections, rollupDay, utcDay } from "@/server/rollup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function bearerMatches(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Nightly job (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). Rolls up the last two UTC days
 * (the second catches late events), refreshes festie connections, then deletes raw events older than 60 days
 * (only days already rolled up).
 * `?date=YYYY-MM-DD` rolls up just that day, for backfills.
 */
export async function GET(req: Request) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return json({ error: "CRON_SECRET is not set." }, 503);
  if (!bearerMatches(req.headers.get("authorization"), secret)) return json({ error: "Unauthorized." }, 401);

  const date = new URL(req.url).searchParams.get("date");
  if (date !== null && !isDay(date)) return json({ error: "date must be YYYY-MM-DD." }, 422);
  const days = date ? [date] : [utcDay(new Date(), 2), utcDay(new Date(), 1)];

  const rolled: Array<{ day: string; rows?: number; error?: string }> = [];
  for (const day of days) {
    try {
      rolled.push({ day, rows: (await rollupDay(day)).rows });
    } catch (error) {
      rolled.push({ day, error: (error as Error).message });
    }
  }
  const connectionsChecked = date ? null : await refreshActiveConnections();
  let purged: number | null = null;
  if (!date) {
    try {
      purged = await purgeOldEvents();
    } catch (error) {
      rolled.push({ day: "purge", error: (error as Error).message });
    }
  }
  const ok = rolled.every((r) => !r.error);
  return json({ ok, rolled, connections: connectionsChecked, purged }, ok ? 200 : 500);
}
