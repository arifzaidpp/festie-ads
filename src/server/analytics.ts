import { and, asc, between, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adDailyBreakdown, ads, connectionFests, connections, sponsors } from "@/db/schema";
import type { Placement } from "@/lib/placements";
import { toCsv, MS_PER_HOUR } from "./billing";
import { daysBetween, WHOLE_FESTIVAL, type ReportFilters } from "./reports";
import { rollupDay, utcDay } from "./rollup";

/** One row of `ad_daily_breakdown` with the names the report needs. */
export interface BreakdownRow {
  date: string;
  hour: number;
  adId: string;
  adTitle: string;
  sponsorName: string;
  subFestId: string;
  screen: string;
  country: string;
  region: string;
  city: string;
  lat: number | null;
  lon: number | null;
  deviceType: string;
  os: string;
  browser: string;
  placement: Placement;
  impressions: number;
  displayMs: number;
  watchMs: number;
  posterGenerated: number;
  posterDownloads: number;
}

export interface Metrics {
  impressions: number;
  displayMs: number;
  watchMs: number;
  posterGenerated: number;
  posterDownloads: number;
}

export interface Group extends Metrics {
  key: string;
  label: string;
  /** A second line under the label (the country of a city, the coordinates of a place). */
  sub?: string;
  /** Screens that showed it, for rows that group by place or device. */
  screens: number;
}

export const UNKNOWN = "Unknown";

const zero = (): Metrics => ({ impressions: 0, displayMs: 0, watchMs: 0, posterGenerated: 0, posterDownloads: 0 });

export function addMetrics(into: Metrics, r: Metrics) {
  into.impressions += r.impressions;
  into.displayMs += r.displayMs;
  into.watchMs += r.watchMs;
  into.posterGenerated += r.posterGenerated;
  into.posterDownloads += r.posterDownloads;
}

/** The most used first: time on screen plus watch time, then downloads, then name. */
export function byUsage(a: Group, b: Group): number {
  return b.displayMs + b.watchMs - (a.displayMs + a.watchMs) || b.posterDownloads - a.posterDownloads || a.label.localeCompare(b.label);
}

/** Sums rows per key. `describe` gives the key and labels of a row; rows with no key are skipped. Pure, so it is tested. */
export function groupRows(
  rows: readonly BreakdownRow[],
  describe: (r: BreakdownRow) => { key: string; label: string; sub?: string } | null,
): Group[] {
  const map = new Map<string, Group & { screenSet: Set<string> }>();
  for (const r of rows) {
    const d = describe(r);
    if (!d) continue;
    let g = map.get(d.key);
    if (!g) {
      g = { ...zero(), key: d.key, label: d.label, sub: d.sub, screens: 0, screenSet: new Set() };
      map.set(d.key, g);
    }
    addMetrics(g, r);
    if (r.screen) g.screenSet.add(r.screen);
  }
  return [...map.values()]
    .map(({ screenSet, ...g }) => ({ ...g, screens: screenSet.size }))
    .sort(byUsage);
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

export function countryName(code: string): string {
  if (!code) return UNKNOWN;
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export const DEVICE_LABEL: Record<string, string> = {
  tv: "TV / signage",
  desktop: "Desktop",
  mobile: "Phone",
  tablet: "Tablet",
  unknown: UNKNOWN,
  "": UNKNOWN,
};

export function mapsUrl(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=13/${lat}/${lon}`;
}

export interface AnalyticsReport {
  filters: ReportFilters;
  totals: Metrics & { screens: number; countries: number; places: number; fests: number };
  daily: Array<Metrics & { date: string }>;
  hourly: Array<Metrics & { hour: number }>;
  byAd: Group[];
  byFest: Group[];
  byScreen: Group[];
  byCountry: Group[];
  byRegion: Group[];
  byCity: Group[];
  byPlace: Group[];
  byDevice: Group[];
  byOs: Group[];
  byBrowser: Group[];
  byPlacement: Group[];
  /** Options for the filters, from the data in range. */
  options: { countries: Array<{ code: string; name: string }>; fests: Array<{ id: string; name: string }> };
  includesToday: boolean;
}

export const PLACEMENT_KEYS: Record<Placement, string> = {
  POSTER_FOOTER: "Poster footer",
  SCREEN_FOOTER: "Screen footer",
  SCREEN_FULLSCREEN: "Screen fullscreen",
};

/** Everything the analytics page and export show, from one set of rows. Pure given the rows, so it is tested. */
export function buildReport(
  rows: readonly BreakdownRow[],
  filters: ReportFilters,
  festName: (subFestId: string) => string,
  now = new Date(),
): AnalyticsReport {
  const total = zero();
  for (const r of rows) addMetrics(total, r);

  const dayMap = new Map<string, Metrics & { date: string }>();
  for (let i = 0, n = daysBetween(filters.from, filters.to); i <= n; i++) {
    const date = utcDay(new Date(`${filters.from}T00:00:00Z`), -i);
    dayMap.set(date, { date, ...zero() });
  }
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, ...zero() }));
  for (const r of rows) {
    const day = dayMap.get(r.date);
    if (day) addMetrics(day, r);
    addMetrics(hourly[r.hour]!, r);
  }

  const known = (v: string, label: (v: string) => string = (x) => x) => (v ? { key: v, label: label(v) } : { key: "", label: UNKNOWN });
  const byCountry = groupRows(rows, (r) => known(r.country, countryName));
  const byRegion = groupRows(rows, (r) =>
    r.region ? { key: `${r.country}|${r.region}`, label: r.region, sub: countryName(r.country) } : { key: "", label: UNKNOWN },
  );
  const byCity = groupRows(rows, (r) =>
    r.city ? { key: `${r.country}|${r.region}|${r.city}`, label: r.city, sub: [r.region, countryName(r.country)].filter(Boolean).join(", ") } : { key: "", label: UNKNOWN },
  );
  const byPlace = groupRows(rows, (r) =>
    r.lat === null || r.lon === null
      ? null
      : {
          key: `${r.lat},${r.lon}`,
          label: r.city || `${r.lat.toFixed(2)}, ${r.lon.toFixed(2)}`,
          sub: `${r.lat.toFixed(2)}, ${r.lon.toFixed(2)}${r.country ? ` · ${countryName(r.country)}` : ""}`,
        },
  );

  const fests = new Map<string, string>();
  for (const r of rows) fests.set(r.subFestId, festName(r.subFestId));
  const countries = new Map<string, string>();
  for (const r of rows) if (r.country) countries.set(r.country, countryName(r.country));

  return {
    filters,
    totals: {
      ...total,
      screens: new Set(rows.map((r) => r.screen).filter(Boolean)).size,
      countries: countries.size,
      places: byPlace.length,
      fests: fests.size,
    },
    daily: [...dayMap.values()],
    hourly,
    byAd: groupRows(rows, (r) => ({ key: r.adId, label: r.adTitle, sub: `${r.sponsorName} · ${PLACEMENT_KEYS[r.placement]}` })),
    byFest: groupRows(rows, (r) => ({ key: r.subFestId, label: festName(r.subFestId) })),
    byScreen: groupRows(rows, (r) => (r.screen ? { key: r.screen, label: r.screen } : { key: "", label: "No screen (poster)" })),
    byCountry,
    byRegion,
    byCity,
    byPlace,
    byDevice: groupRows(rows, (r) => ({ key: r.deviceType, label: DEVICE_LABEL[r.deviceType] ?? r.deviceType })),
    byOs: groupRows(rows, (r) => known(r.os)),
    byBrowser: groupRows(rows, (r) => known(r.browser)),
    byPlacement: groupRows(rows, (r) => ({ key: r.placement, label: PLACEMENT_KEYS[r.placement] })),
    options: {
      countries: [...countries].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name)),
      fests: [...fests].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    },
    includesToday: filters.to >= utcDay(now) && filters.from <= utcDay(now),
  };
}

/** The account's breakdown rows in range. A range with today rebuilds today first so it is current but partial. */
export async function loadBreakdown(accountId: string, f: ReportFilters, now = new Date()): Promise<{ rows: BreakdownRow[]; festName: (id: string) => string }> {
  const today = utcDay(now);
  if (f.to >= today && f.from <= today) await rollupDay(today);

  const b = adDailyBreakdown;
  const conditions = [eq(ads.accountId, accountId), between(b.dateUtc, f.from, f.to)];
  if (f.sponsorId) conditions.push(eq(ads.sponsorId, f.sponsorId));
  if (f.adId) conditions.push(eq(ads.id, f.adId));
  if (f.placement) conditions.push(eq(b.placement, f.placement));
  if (f.subFestId) conditions.push(eq(b.subFestId, f.subFestId));
  if (f.country) conditions.push(eq(b.country, f.country));
  if (f.deviceType) conditions.push(eq(b.deviceType, f.deviceType === "unknown" ? "" : f.deviceType));

  const db = getDb();
  const [rows, fests] = await Promise.all([
    db
      .select({
        date: b.dateUtc, hour: b.hourUtc, adId: ads.id, adTitle: ads.title, sponsorName: sponsors.name, subFestId: b.subFestId,
        screen: b.screenKey, country: b.country, region: b.region, city: b.city, latE2: b.latE2, lonE2: b.lonE2,
        deviceType: b.deviceType, os: b.os, browser: b.browser, placement: b.placement,
        impressions: b.impressions, displayMs: b.displayMs, watchMs: b.watchMs,
        posterGenerated: b.posterGenerated, posterDownloads: b.posterDownloads,
      })
      .from(b)
      .innerJoin(ads, eq(ads.id, b.adId))
      .innerJoin(sponsors, eq(sponsors.id, ads.sponsorId))
      .where(and(...conditions))
      .orderBy(asc(b.dateUtc)),
    db
      .select({ id: connectionFests.subFestId, name: connectionFests.name })
      .from(connectionFests)
      .innerJoin(connections, eq(connections.id, connectionFests.connectionId))
      .where(eq(connections.accountId, accountId)),
  ]);
  const names = new Map(fests.map((x) => [x.id, x.name]));
  return {
    rows: rows.map(({ latE2, lonE2, ...r }) => {
      // 0,0 is the stored "no location"; a real point is never exactly 0.00, 0.00 at this resolution of use.
      const located = latE2 !== 0 || lonE2 !== 0;
      return { ...r, lat: located ? latE2 / 100 : null, lon: located ? lonE2 / 100 : null };
    }),
    festName: (id) => (id === "-" ? WHOLE_FESTIVAL : (names.get(id) ?? id)),
  };
}

export async function analyticsReport(accountId: string, filters: ReportFilters, now = new Date()): Promise<AnalyticsReport> {
  const { rows, festName } = await loadBreakdown(accountId, filters, now);
  return buildReport(rows, filters, festName, now);
}

export const EXPORT_DIMENSIONS = ["ad", "fest", "screen", "country", "region", "city", "place", "device", "os", "browser", "placement", "hour", "day"] as const;
export type ExportDimension = (typeof EXPORT_DIMENSIONS)[number];

/** One CSV per dimension, same numbers as the page. */
export function analyticsCsv(report: AnalyticsReport, dim: ExportDimension): string {
  const hours = (ms: number) => (ms / MS_PER_HOUR).toFixed(4);
  const header = [dim === "hour" ? "Hour (UTC)" : dim === "day" ? "Date (UTC)" : "Name", "Detail", "Impressions", "Hours shown", "Hours watched", "Poster generated", "Poster downloads"];
  const fromMetrics = (name: string | number, detail: string, m: Metrics) => [name, detail, m.impressions, hours(m.displayMs), hours(m.watchMs), m.posterGenerated, m.posterDownloads];
  let body: Array<Array<string | number>>;
  if (dim === "hour") body = report.hourly.map((h) => fromMetrics(String(h.hour).padStart(2, "0"), "", h));
  else if (dim === "day") body = report.daily.map((d) => fromMetrics(d.date, "", d));
  else {
    const groups = {
      ad: report.byAd, fest: report.byFest, screen: report.byScreen, country: report.byCountry, region: report.byRegion,
      city: report.byCity, place: report.byPlace, device: report.byDevice, os: report.byOs, browser: report.byBrowser, placement: report.byPlacement,
    }[dim];
    body = groups.map((g) => fromMetrics(g.label, g.sub ?? "", g));
  }
  return toCsv([header, ...body]);
}
