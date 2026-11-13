import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { adEvents, ads, connectionFests, connections } from "@/db/schema";
import { PLACEMENTS, type MediaType, type Placement } from "@/lib/placements";

export const EVENT_KINDS = ["POSTER_GENERATED", "POSTER_DOWNLOADED", "SCREEN_DISPLAY_MS", "VIDEO_WATCH_MS"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const MAX_EVENTS_PER_CALL = 100;
/**
 * Most events one connection may report per minute. 50 screens with two ads each send about 14 a minute, so
 * this is far above real use and only stops a runaway or hostile sender from filling the database.
 */
export const MAX_EVENTS_PER_MINUTE = 1200;
/** `sub_fest_id` of usage on a screen that belongs to the whole festival, not one fest. */
export const FESTIVAL_WIDE = "-";
/** A heartbeat carries at most this much; a longer value is a bug or abuse. */
export const MAX_BEAT_MS = 20_000;
/** One poster event may stand for this many poster files (a zip of a whole programme). */
export const MAX_POSTER_COUNT = 5000;
/** Events older than this are refused, so a replayed capture cannot add usage. */
export const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;
/** Clock skew allowed for events stamped in the future. */
export const MAX_FUTURE_MS = 5 * 60 * 1000;

/** The call itself. Individual events are checked one by one so one bad event does not drop the rest. */
export const DEVICE_TYPES = ["tv", "desktop", "mobile", "tablet", "unknown"] as const;
const label = (max: number) => z.string().trim().min(1).max(max).optional();

/** Where and on what the events happened. Optional and untrusted: it only feeds analytics, never billing. */
export const eventContext = z.object({
  /** The screen (its slug) that played the ad. */
  screen: label(80),
  geo: z
    .object({
      country: z.string().trim().length(2).optional(),
      region: label(100),
      city: label(100),
      lat: z.number().min(-90).max(90).optional(),
      lon: z.number().min(-180).max(180).optional(),
    })
    .optional(),
  device: z.object({ type: z.enum(DEVICE_TYPES).optional(), os: label(40), browser: label(40) }).optional(),
});
export type EventContext = z.infer<typeof eventContext>;

export const eventsEnvelope = z.object({
  external_ref: z.uuid(),
  events: z.array(z.unknown()).max(MAX_EVENTS_PER_CALL),
  context: eventContext.optional(),
});

/** Columns for the context. Coordinates are rounded to about 1 km on purpose: no raw IP, no street-level data. */
export function contextColumns(context: EventContext | undefined) {
  const geo = context?.geo;
  const hasPoint = geo?.lat !== undefined && geo?.lon !== undefined;
  return {
    screenKey: context?.screen ?? null,
    country: geo?.country ? geo.country.toUpperCase() : null,
    region: geo?.region ?? null,
    city: geo?.city ?? null,
    lat: hasPoint ? Math.round(geo!.lat! * 100) / 100 : null,
    lon: hasPoint ? Math.round(geo!.lon! * 100) / 100 : null,
    deviceType: context?.device?.type ?? null,
    os: context?.device?.os ?? null,
    browser: context?.device?.browser ?? null,
  };
}

export const eventInput = z.object({
  id: z.string().min(1).max(160),
  ad_id: z.uuid(),
  kind: z.enum(EVENT_KINDS),
  placement: z.enum(PLACEMENTS),
  sub_fest_id: z.string().min(1).max(64),
  /** Milliseconds for the *_MS kinds; the number of poster files (default 1) for the poster kinds. */
  value: z.number().int().min(0).default(0),
  session_id: z.string().min(1).max(80).optional(),
  occurred_at: z.iso.datetime({ offset: true }),
});
export type EventInput = z.infer<typeof eventInput>;

export interface AdFacts {
  accountId: string;
  placement: Placement;
  mediaType: MediaType;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
}

export type RejectReason =
  | "invalid"
  | "unknown_ad"
  | "ad_not_live"
  | "wrong_placement"
  | "fest_not_connected"
  | "kind_not_allowed"
  | "value_out_of_range"
  | "too_old"
  | "in_future";

/** Why an event cannot count, or null when it can. Pure, so every rule is unit tested. */
export function rejectReason(
  event: EventInput,
  ctx: { ad: AdFacts | undefined; accountId: string; festIds: ReadonlySet<string>; now: Date },
): RejectReason | null {
  const { ad } = ctx;
  if (!ad || ad.accountId !== ctx.accountId) return "unknown_ad";
  if (ad.status === "DRAFT") return "ad_not_live";
  if (ad.placement !== event.placement) return "wrong_placement";
  if (event.sub_fest_id !== FESTIVAL_WIDE && !ctx.festIds.has(event.sub_fest_id)) return "fest_not_connected";

  const poster = event.kind === "POSTER_GENERATED" || event.kind === "POSTER_DOWNLOADED";
  if (poster !== (event.placement === "POSTER_FOOTER")) return "kind_not_allowed";
  if (event.kind === "VIDEO_WATCH_MS" && ad.mediaType !== "VIDEO") return "kind_not_allowed";

  if (poster ? event.value > MAX_POSTER_COUNT : event.value < 1 || event.value > MAX_BEAT_MS) return "value_out_of_range";

  const age = ctx.now.getTime() - new Date(event.occurred_at).getTime();
  if (age > MAX_EVENT_AGE_MS) return "too_old";
  if (age < -MAX_FUTURE_MS) return "in_future";
  return null;
}

/** True when `incoming` more events still fit under the per-minute cap. */
export function withinRateLimit(recent: number, incoming: number, limit: number = MAX_EVENTS_PER_MINUTE): boolean {
  return recent + incoming <= limit;
}

export interface IngestResult {
  accepted: number;
  duplicates: number;
  rejected: Array<{ id: string; reason: RejectReason }>;
}

/**
 * Stores the valid events of one connection. Returns null when the external ref has no active connection
 * and "rate_limited" when the connection already sent too many events in the last minute (nothing is stored).
 */
export async function ingestEvents(
  externalRef: string,
  rawEvents: readonly unknown[],
  now: Date = new Date(),
  context?: EventContext,
): Promise<IngestResult | "rate_limited" | null> {
  const db = getDb();
  const [connection] = await db
    .select({ id: connections.id })
    .from(connections)
    .where(and(eq(connections.accountId, externalRef), eq(connections.status, "ACTIVE")));
  if (!connection) return null;

  const [{ recent } = { recent: 0 }] = await db
    .select({ recent: sql<number>`count(*)::int` })
    .from(adEvents)
    .where(and(eq(adEvents.connectionId, connection.id), gte(adEvents.receivedAt, new Date(now.getTime() - 60_000))));
  if (!withinRateLimit(recent, rawEvents.length)) return "rate_limited";

  const rejected: IngestResult["rejected"] = [];
  const parsed: EventInput[] = [];
  rawEvents.forEach((raw, index) => {
    const result = eventInput.safeParse(raw);
    if (result.success) parsed.push(result.data);
    else {
      const id = typeof (raw as { id?: unknown })?.id === "string" ? (raw as { id: string }).id : `#${index}`;
      rejected.push({ id, reason: "invalid" });
    }
  });
  if (parsed.length === 0) return { accepted: 0, duplicates: 0, rejected };

  const adIds = [...new Set(parsed.map((e) => e.ad_id))];
  const [adRows, festRows] = await Promise.all([
    db
      .select({ id: ads.id, accountId: ads.accountId, placement: ads.placement, mediaType: ads.mediaType, status: ads.status })
      .from(ads)
      .where(inArray(ads.id, adIds)),
    db.select({ id: connectionFests.subFestId }).from(connectionFests).where(eq(connectionFests.connectionId, connection.id)),
  ]);
  const adById = new Map(adRows.map((a) => [a.id, a as AdFacts & { id: string }]));
  const festIds = new Set(festRows.map((f) => f.id));

  const valid: Array<{ event: EventInput; ad: AdFacts }> = [];
  for (const event of parsed) {
    const ad = adById.get(event.ad_id);
    const reason = rejectReason(event, { ad, accountId: externalRef, festIds, now });
    if (reason) rejected.push({ id: event.id, reason });
    else valid.push({ event, ad: ad! });
  }
  if (valid.length === 0) return { accepted: 0, duplicates: 0, rejected };

  const where = contextColumns(context);
  const inserted = await db
    .insert(adEvents)
    .values(
      valid.map(({ event, ad }) => ({
        idempotencyKey: event.id,
        connectionId: connection.id,
        adId: event.ad_id,
        subFestId: event.sub_fest_id,
        placement: ad.placement,
        mediaType: ad.mediaType,
        kind: event.kind,
        value: event.kind === "POSTER_GENERATED" || event.kind === "POSTER_DOWNLOADED" ? Math.max(1, event.value) : event.value,
        sessionId: event.session_id ?? null,
        occurredAt: new Date(event.occurred_at),
        ...where,
      })),
    )
    .onConflictDoNothing({ target: adEvents.idempotencyKey })
    .returning({ id: adEvents.id });

  return { accepted: inserted.length, duplicates: valid.length - inserted.length, rejected };
}
