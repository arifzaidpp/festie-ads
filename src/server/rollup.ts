import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { connections, rollupRuns } from "@/db/schema";
import { refreshConnection } from "./connections";

/** A showing counts as an impression once it has been on screen this long (summed per session and day). */
export const IMPRESSION_MIN_MS = 5000;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` in UTC, `daysAgo` days before `now`. */
export function utcDay(now: Date, daysAgo = 0): string {
  return new Date(now.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

export function isDay(value: string): boolean {
  return DAY_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && utcDay(new Date(`${value}T00:00:00Z`)) === value;
}

/**
 * Rebuilds `ad_daily_stats` for one UTC day from the raw events. Safe to run again: it replaces the
 * day's rows, so late events and reruns never double count.
 */
export async function rollupDay(day: string): Promise<{ rows: number }> {
  if (!isDay(day)) throw new Error(`Invalid day: ${day}`);
  const db = getDb();
  await db
    .insert(rollupRuns)
    .values({ dateUtc: day, status: "RUNNING" })
    .onConflictDoUpdate({
      target: rollupRuns.dateUtc,
      set: { status: "RUNNING", startedAt: new Date(), finishedAt: null },
    });
  try {
    const result = await db.execute(sql`
      with bounds as (
        select (${day}::date)::timestamp at time zone 'UTC' as s,
               ((${day}::date + 1)::timestamp) at time zone 'UTC' as e
      ),
      day_events as (
        select ev.* from ad_events ev, bounds b where ev.occurred_at >= b.s and ev.occurred_at < b.e
      ),
      sessions as (
        select ad_id, sub_fest_id, count(*)::int as impressions
        from (
          select ad_id, sub_fest_id, session_id
          from day_events
          where kind = 'SCREEN_DISPLAY_MS' and session_id is not null
          group by ad_id, sub_fest_id, session_id
          having sum(value) >= ${IMPRESSION_MIN_MS}
        ) s
        group by ad_id, sub_fest_id
      ),
      agg as (
        select ad_id, sub_fest_id,
               max(placement::text)::placement as placement,
               max(media_type::text)::media_type as media_type,
               coalesce(sum(value) filter (where kind = 'POSTER_GENERATED'), 0)::int as poster_generated,
               coalesce(sum(value) filter (where kind = 'POSTER_DOWNLOADED'), 0)::int as poster_downloads,
               coalesce(sum(value) filter (where kind = 'SCREEN_DISPLAY_MS'), 0)::int as display_ms,
               coalesce(sum(value) filter (where kind = 'VIDEO_WATCH_MS'), 0)::int as watch_ms
        from day_events
        group by ad_id, sub_fest_id
      )
      insert into ad_daily_stats
        (date_utc, ad_id, sub_fest_id, placement, media_type, poster_generated, poster_downloads, display_ms, watch_ms, impressions, updated_at)
      select ${day}::date, a.ad_id, a.sub_fest_id, a.placement, a.media_type, a.poster_generated, a.poster_downloads,
             a.display_ms, a.watch_ms, coalesce(s.impressions, 0), now()
      from agg a
      left join sessions s on s.ad_id = a.ad_id and s.sub_fest_id = a.sub_fest_id
      on conflict (date_utc, ad_id, sub_fest_id) do update set
        placement = excluded.placement,
        media_type = excluded.media_type,
        poster_generated = excluded.poster_generated,
        poster_downloads = excluded.poster_downloads,
        display_ms = excluded.display_ms,
        watch_ms = excluded.watch_ms,
        impressions = excluded.impressions,
        updated_at = now()
      returning 1
    `);
    await rollupBreakdown(day);
    await db.update(rollupRuns).set({ status: "DONE", finishedAt: new Date() }).where(eq(rollupRuns.dateUtc, day));
    return { rows: result.rows.length };
  } catch (error) {
    await db.update(rollupRuns).set({ status: "FAILED", finishedAt: new Date() }).where(eq(rollupRuns.dateUtc, day));
    throw error;
  }
}

/**
 * Rebuilds `ad_daily_breakdown` for one UTC day (an upsert, so two runs at once cannot collide; events are never removed before the day is final): the same events as `ad_daily_stats`, split by hour, screen,
 * place and device. An impression (a session with enough display time) is counted once, where it started.
 */
async function rollupBreakdown(day: string) {
  const db = getDb();
  await db.execute(sql`
    with bounds as (
      select (${day}::date)::timestamp at time zone 'UTC' as s,
             ((${day}::date + 1)::timestamp) at time zone 'UTC' as e
    ),
    k as (
      select ev.ad_id, ev.sub_fest_id, ev.session_id, ev.kind, ev.value, ev.occurred_at, ev.placement, ev.media_type,
             extract(hour from ev.occurred_at at time zone 'UTC')::smallint as hr,
             coalesce(ev.screen_key, '') as sk, coalesce(ev.country, '') as c, coalesce(ev.region, '') as r,
             coalesce(ev.city, '') as ci, round(coalesce(ev.lat, 0) * 100)::int as la, round(coalesce(ev.lon, 0) * 100)::int as lo,
             coalesce(ev.device_type, '') as dt, coalesce(ev.os, '') as o, coalesce(ev.browser, '') as b
      from ad_events ev, bounds
      where ev.occurred_at >= bounds.s and ev.occurred_at < bounds.e
    ),
    qualifying as (
      select ad_id, sub_fest_id, session_id
      from k
      where kind = 'SCREEN_DISPLAY_MS' and session_id is not null
      group by ad_id, sub_fest_id, session_id
      having sum(value) >= ${IMPRESSION_MIN_MS}
    ),
    starts as (
      select distinct on (k.ad_id, k.sub_fest_id, k.session_id) k.*
      from k join qualifying q using (ad_id, sub_fest_id, session_id)
      where k.kind = 'SCREEN_DISPLAY_MS'
      order by k.ad_id, k.sub_fest_id, k.session_id, k.occurred_at
    ),
    imp as (
      select ad_id, sub_fest_id, hr, sk, c, r, ci, la, lo, dt, o, b, count(*)::int as impressions
      from starts group by ad_id, sub_fest_id, hr, sk, c, r, ci, la, lo, dt, o, b
    ),
    agg as (
      select ad_id, sub_fest_id, hr, sk, c, r, ci, la, lo, dt, o, b,
             max(placement::text)::placement as placement, max(media_type::text)::media_type as media_type,
             coalesce(sum(value) filter (where kind = 'POSTER_GENERATED'), 0)::int as poster_generated,
             coalesce(sum(value) filter (where kind = 'POSTER_DOWNLOADED'), 0)::int as poster_downloads,
             coalesce(sum(value) filter (where kind = 'SCREEN_DISPLAY_MS'), 0)::int as display_ms,
             coalesce(sum(value) filter (where kind = 'VIDEO_WATCH_MS'), 0)::int as watch_ms
      from k group by ad_id, sub_fest_id, hr, sk, c, r, ci, la, lo, dt, o, b
    )
    insert into ad_daily_breakdown
      (date_utc, ad_id, sub_fest_id, hour_utc, screen_key, country, region, city, lat_e2, lon_e2, device_type, os, browser,
       placement, media_type, impressions, display_ms, watch_ms, poster_generated, poster_downloads, updated_at)
    select ${day}::date, a.ad_id, a.sub_fest_id, a.hr, a.sk, a.c, a.r, a.ci, a.la, a.lo, a.dt, a.o, a.b,
           a.placement, a.media_type, coalesce(i.impressions, 0), a.display_ms, a.watch_ms, a.poster_generated, a.poster_downloads, now()
    from agg a
    left join imp i on i.ad_id = a.ad_id and i.sub_fest_id = a.sub_fest_id and i.hr = a.hr and i.sk = a.sk and i.c = a.c
      and i.r = a.r and i.ci = a.ci and i.la = a.la and i.lo = a.lo and i.dt = a.dt and i.o = a.o and i.b = a.b
    on conflict (date_utc, ad_id, sub_fest_id, hour_utc, screen_key, country, region, city, lat_e2, lon_e2, device_type, os, browser)
    do update set placement = excluded.placement, media_type = excluded.media_type, impressions = excluded.impressions,
      display_ms = excluded.display_ms, watch_ms = excluded.watch_ms, poster_generated = excluded.poster_generated,
      poster_downloads = excluded.poster_downloads, updated_at = now()
  `);
}

/** Re-reads every active connection from festie so revoked ones are noticed. One failure never stops the rest. */
export async function refreshActiveConnections(): Promise<{ checked: number; failed: number }> {
  const rows = await getDb()
    .select({ ownerId: connections.ownerId, accountId: connections.accountId })
    .from(connections)
    .where(eq(connections.status, "ACTIVE"));
  let failed = 0;
  for (const row of rows) {
    try {
      await refreshConnection(row.ownerId, row.accountId);
    } catch {
      failed += 1;
    }
  }
  return { checked: rows.length, failed };
}
