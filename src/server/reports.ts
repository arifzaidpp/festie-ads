import { and, asc, between, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { adDailyStats, adAccounts, ads, connectionFests, connections, priceRates, sponsors } from "@/db/schema";
import { PLACEMENTS } from "@/lib/placements";
import type { RateRow, StatRow } from "./billing";
import { DEVICE_TYPES } from "./events";
import { HttpError } from "./http";
import { isDay, rollupDay, utcDay } from "./rollup";

export const MAX_RANGE_DAYS = 366;

export interface ReportFilters {
  from: string;
  to: string;
  sponsorId?: string;
  adId?: string;
  placement?: (typeof PLACEMENTS)[number];
  /** A fest id, or `-` for screens of the whole festival. */
  subFestId?: string;
  /** Analytics only: ISO country code, and a device type (`unknown` = not reported). */
  country?: string;
  deviceType?: string;
}

const optionalUuid = z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional());

const filterShape = z.object({
  from: z.string().refine(isDay, "from must be YYYY-MM-DD").optional(),
  to: z.string().refine(isDay, "to must be YYYY-MM-DD").optional(),
  sponsorId: optionalUuid,
  adId: optionalUuid,
  subFestId: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(64).optional()),
  country: z.preprocess((v) => (v === "" ? undefined : v), z.string().length(2).transform((c) => c.toUpperCase()).optional()),
  deviceType: z.preprocess((v) => (v === "" ? undefined : v), z.enum([...DEVICE_TYPES]).optional()),
  placement: z.preprocess((v) => (v === "" ? undefined : v), z.enum(PLACEMENTS).optional()),
});

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Query string to filters. Default range: the last 30 days up to today (UTC). Throws HttpError 422 when invalid. */
export function parseFilters(params: URLSearchParams | Record<string, string | undefined>, now = new Date()): ReportFilters {
  const raw = params instanceof URLSearchParams ? Object.fromEntries(params) : params;
  const parsed = filterShape.safeParse({ ...raw, from: raw.from || undefined, to: raw.to || undefined });
  if (!parsed.success) throw new HttpError(422, parsed.error.issues.map((i) => i.message).join("; "));
  const to = parsed.data.to ?? utcDay(now);
  const from = parsed.data.from ?? utcDay(new Date(`${to}T00:00:00Z`), 29);
  if (from > to) throw new HttpError(422, "from must not be after to.");
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) throw new HttpError(422, `Pick at most ${MAX_RANGE_DAYS} days.`);
  return { ...parsed.data, from, to };
}

export interface StatRowWithFest extends StatRow {
  festName: string;
}

export const WHOLE_FESTIVAL = "Whole festival";

export function loadRates(accountId: string): Promise<RateRow[]> {
  return getDb()
    .select({
      placement: priceRates.placement,
      mediaType: priceRates.mediaType,
      amountMinor: priceRates.amountMinor,
      currency: priceRates.currency,
      effectiveFrom: priceRates.effectiveFrom,
    })
    .from(priceRates)
    .where(eq(priceRates.accountId, accountId));
}

/**
 * Daily rows of the owner's ads in the range. When the range includes today, today's rows are rebuilt from
 * the raw events first (the nightly job only covers finished days), so today is current but partial.
 */
export async function loadStats(accountId: string, f: ReportFilters, now = new Date()): Promise<StatRowWithFest[]> {
  const today = utcDay(now);
  if (f.to >= today && f.from <= today) await rollupDay(today);

  const db = getDb();
  const conditions = [eq(ads.accountId, accountId), between(adDailyStats.dateUtc, f.from, f.to)];
  if (f.sponsorId) conditions.push(eq(ads.sponsorId, f.sponsorId));
  if (f.subFestId) conditions.push(eq(adDailyStats.subFestId, f.subFestId));
  if (f.adId) conditions.push(eq(ads.id, f.adId));
  if (f.placement) conditions.push(eq(adDailyStats.placement, f.placement));

  const [rows, fests] = await Promise.all([
    db
      .select({
        date: adDailyStats.dateUtc,
        adId: ads.id,
        adTitle: ads.title,
        sponsorId: sponsors.id,
        sponsorName: sponsors.name,
        accountId: adAccounts.id,
        accountName: adAccounts.name,
        subFestId: adDailyStats.subFestId,
        placement: adDailyStats.placement,
        mediaType: adDailyStats.mediaType,
        posterGenerated: adDailyStats.posterGenerated,
        posterDownloads: adDailyStats.posterDownloads,
        displayMs: adDailyStats.displayMs,
        watchMs: adDailyStats.watchMs,
        impressions: adDailyStats.impressions,
      })
      .from(adDailyStats)
      .innerJoin(ads, eq(ads.id, adDailyStats.adId))
      .innerJoin(sponsors, eq(sponsors.id, ads.sponsorId))
      .innerJoin(adAccounts, eq(adAccounts.id, ads.accountId))
      .where(and(...conditions))
      .orderBy(asc(adDailyStats.dateUtc), asc(sponsors.name), asc(ads.title)),
    db
      .select({ accountId: connections.accountId, subFestId: connectionFests.subFestId, name: connectionFests.name })
      .from(connectionFests)
      .innerJoin(connections, eq(connections.id, connectionFests.connectionId))
      .where(eq(connections.accountId, accountId)),
  ]);
  const festName = new Map(fests.map((x) => [`${x.accountId}:${x.subFestId}`, x.name]));
  return rows.map((r) => ({
    ...r,
    festName: r.subFestId === "-" ? WHOLE_FESTIVAL : (festName.get(`${r.accountId}:${r.subFestId}`) ?? r.subFestId),
  }));
}

export interface DailyPoint {
  date: string;
  impressions: number;
  displayMs: number;
  watchMs: number;
  posterDownloads: number;
  posterGenerated: number;
}

/** One point per day of the range (zeros included), summed over the given rows. */
export function dailySeries(rows: readonly StatRow[], from: string, to: string): DailyPoint[] {
  const byDay = new Map<string, DailyPoint>();
  for (let i = 0, n = daysBetween(from, to); i <= n; i++) {
    const date = utcDay(new Date(`${from}T00:00:00Z`), -i);
    byDay.set(date, { date, impressions: 0, displayMs: 0, watchMs: 0, posterDownloads: 0, posterGenerated: 0 });
  }
  for (const r of rows) {
    const p = byDay.get(r.date);
    if (!p) continue;
    p.impressions += r.impressions;
    p.displayMs += r.displayMs;
    p.watchMs += r.watchMs;
    p.posterDownloads += r.posterDownloads;
    p.posterGenerated += r.posterGenerated;
  }
  return [...byDay.values()];
}

export interface AdTotals {
  adId: string;
  adTitle: string;
  sponsorName: string;
  accountName: string;
  placement: StatRow["placement"];
  mediaType: StatRow["mediaType"];
  impressions: number;
  displayMs: number;
  watchMs: number;
  posterDownloads: number;
  posterGenerated: number;
}

export function totalsByAd(rows: readonly StatRow[]): AdTotals[] {
  const map = new Map<string, AdTotals>();
  for (const r of rows) {
    let t = map.get(r.adId);
    if (!t) {
      t = {
        adId: r.adId, adTitle: r.adTitle, sponsorName: r.sponsorName, accountName: r.accountName,
        placement: r.placement, mediaType: r.mediaType,
        impressions: 0, displayMs: 0, watchMs: 0, posterDownloads: 0, posterGenerated: 0,
      };
      map.set(r.adId, t);
    }
    t.impressions += r.impressions;
    t.displayMs += r.displayMs;
    t.watchMs += r.watchMs;
    t.posterDownloads += r.posterDownloads;
    t.posterGenerated += r.posterGenerated;
  }
  return [...map.values()].sort((a, b) => b.displayMs + b.watchMs - (a.displayMs + a.watchMs) || a.adTitle.localeCompare(b.adTitle));
}
