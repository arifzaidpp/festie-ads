import { sql } from "drizzle-orm";
import { getDb } from "@/db";

/** Raw events are kept this long. Billing never needs them: it reads the daily rollup. */
export const EVENT_RETENTION_DAYS = 60;
/** One run deletes at most this many rows, so a cron call stays short; the next night continues. */
const BATCH = 20_000;

/**
 * Deletes raw events older than the retention window, but only the days that are already rolled up
 * (`rollup_runs` DONE). An event of a day that was never rolled up is kept until it is, so no usage is
 * lost if the nightly job was down for a while.
 */
export async function purgeOldEvents(now: Date = new Date(), days = EVENT_RETENTION_DAYS): Promise<number> {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const result = await getDb().execute(sql`
    delete from ad_events
    where id in (
      select e.id from ad_events e
      where e.occurred_at < ${cutoff.toISOString()}::timestamptz
        and exists (
          select 1 from rollup_runs r
          where r.date_utc = (e.occurred_at at time zone 'UTC')::date and r.status = 'DONE'
        )
      limit ${BATCH}
    )
    returning 1
  `);
  return result.rows.length;
}
