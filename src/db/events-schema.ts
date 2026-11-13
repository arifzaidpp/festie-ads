import { sql } from "drizzle-orm";
import {
  char,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { ads, mediaTypeEnum, placementEnum } from "./ads-schema";
import { connections } from "./connections-schema";

export const eventKindEnum = pgEnum("event_kind", [
  "POSTER_GENERATED",
  "POSTER_DOWNLOADED",
  "SCREEN_DISPLAY_MS",
  "VIDEO_WATCH_MS",
]);

const ts = (name: string) => timestamp(name, { withTimezone: true });

/** Raw usage events reported by festie. Kept 60 days; `ad_daily_stats` is what billing reads. */
export const adEvents = pgTable(
  "ad_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Sender-chosen key; a repeated key is a duplicate and is ignored. */
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull().unique(),
    connectionId: uuid("connection_id").notNull().references(() => connections.id, { onDelete: "cascade" }),
    adId: uuid("ad_id").notNull().references(() => ads.id, { onDelete: "restrict" }),
    subFestId: varchar("sub_fest_id", { length: 64 }).notNull(),
    placement: placementEnum("placement").notNull(),
    mediaType: mediaTypeEnum("media_type").notNull(),
    kind: eventKindEnum("kind").notNull(),
    /** Milliseconds for the *_MS kinds, 1 for the poster kinds. */
    value: integer("value").notNull(),
    /** One showing of one ad on one screen, so impressions can be counted. */
    sessionId: varchar("session_id", { length: 80 }),
    /** Where and on what the ad was seen. All optional: festie sends what it knows, never a raw IP. */
    screenKey: varchar("screen_key", { length: 80 }),
    country: char("country", { length: 2 }),
    region: varchar("region", { length: 100 }),
    city: varchar("city", { length: 100 }),
    lat: real("lat"),
    lon: real("lon"),
    deviceType: varchar("device_type", { length: 16 }),
    os: varchar("os", { length: 40 }),
    browser: varchar("browser", { length: 40 }),
    occurredAt: ts("occurred_at").notNull(),
    receivedAt: ts("received_at").notNull().defaultNow(),
  },
  (t) => [
    index("ad_events_day_idx").on(t.occurredAt),
    index("ad_events_ad_idx").on(t.adId, t.occurredAt),
    index("ad_events_conn_received_idx").on(t.connectionId, t.receivedAt),
    check("ad_events_value_range", sql`${t.value} BETWEEN 0 AND 600000`),
  ],
);

/** One row per ad, fest and UTC day, rebuilt from `ad_events` by the nightly rollup. */
export const adDailyStats = pgTable(
  "ad_daily_stats",
  {
    dateUtc: date("date_utc").notNull(),
    adId: uuid("ad_id").notNull().references(() => ads.id, { onDelete: "restrict" }),
    subFestId: varchar("sub_fest_id", { length: 64 }).notNull(),
    placement: placementEnum("placement").notNull(),
    mediaType: mediaTypeEnum("media_type").notNull(),
    posterGenerated: integer("poster_generated").notNull().default(0),
    posterDownloads: integer("poster_downloads").notNull().default(0),
    displayMs: integer("display_ms").notNull().default(0),
    watchMs: integer("watch_ms").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.dateUtc, t.adId, t.subFestId] }), index("ad_daily_stats_ad_idx").on(t.adId)],
);

/**
 * `ad_daily_stats` split by hour, screen, place and device, for analytics. Same events, same rules, rebuilt
 * together by the rollup. Empty string / 0 mean "unknown" so every column can sit in the primary key.
 * Billing never reads this table.
 */
export const adDailyBreakdown = pgTable(
  "ad_daily_breakdown",
  {
    dateUtc: date("date_utc").notNull(),
    adId: uuid("ad_id").notNull().references(() => ads.id, { onDelete: "restrict" }),
    subFestId: varchar("sub_fest_id", { length: 64 }).notNull(),
    hourUtc: smallint("hour_utc").notNull(),
    screenKey: varchar("screen_key", { length: 80 }).notNull().default(""),
    country: char("country", { length: 2 }).notNull().default(""),
    region: varchar("region", { length: 100 }).notNull().default(""),
    city: varchar("city", { length: 100 }).notNull().default(""),
    /** Degrees times 100 (about 1 km). */
    latE2: integer("lat_e2").notNull().default(0),
    lonE2: integer("lon_e2").notNull().default(0),
    deviceType: varchar("device_type", { length: 16 }).notNull().default(""),
    os: varchar("os", { length: 40 }).notNull().default(""),
    browser: varchar("browser", { length: 40 }).notNull().default(""),
    placement: placementEnum("placement").notNull(),
    mediaType: mediaTypeEnum("media_type").notNull(),
    impressions: integer("impressions").notNull().default(0),
    displayMs: integer("display_ms").notNull().default(0),
    watchMs: integer("watch_ms").notNull().default(0),
    posterGenerated: integer("poster_generated").notNull().default(0),
    posterDownloads: integer("poster_downloads").notNull().default(0),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      columns: [t.dateUtc, t.adId, t.subFestId, t.hourUtc, t.screenKey, t.country, t.region, t.city, t.latE2, t.lonE2, t.deviceType, t.os, t.browser],
    }),
    index("ad_daily_breakdown_ad_idx").on(t.adId, t.dateUtc),
  ],
);
