import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  jsonb,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const placementEnum = pgEnum("placement", ["POSTER_FOOTER", "SCREEN_FOOTER", "SCREEN_FULLSCREEN"]);
export const mediaTypeEnum = pgEnum("media_type", ["IMAGE", "VIDEO"]);
export const adStatusEnum = pgEnum("ad_status", ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]);
export const rateUnitEnum = pgEnum("rate_unit", ["PER_DOWNLOAD", "PER_HOUR_DISPLAYED", "PER_HOUR_WATCHED"]);
/** Physical names keep their old "group" spelling: an ad account was an "ad group" before the rename. */
export const accountStatusEnum = pgEnum("group_status", ["ACTIVE", "ARCHIVED"]);

import type { MediaLayout } from "@/lib/media-layout";
import type { Radius } from "@/lib/targeting";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const sponsors = pgTable(
  "sponsors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => adAccounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    contactEmail: varchar("contact_email", { length: 200 }),
    notes: text("notes"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("sponsors_owner_idx").on(t.ownerId), index("sponsors_account_idx").on(t.accountId)],
);

export const priceRates = pgTable(
  "price_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => adAccounts.id, { onDelete: "cascade" }),
    placement: placementEnum("placement").notNull(),
    mediaType: mediaTypeEnum("media_type").notNull(),
    unit: rateUnitEnum("unit").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    effectiveFrom: date("effective_from").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("price_rates_account_combo_from_uq").on(t.accountId, t.placement, t.mediaType, t.effectiveFrom),
    check("price_rates_no_poster_video", sql`NOT (${t.placement} = 'POSTER_FOOTER' AND ${t.mediaType} = 'VIDEO')`),
    check("price_rates_amount_nonneg", sql`${t.amountMinor} >= 0`),
  ],
);

export const adAccounts = pgTable(
  "ad_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    status: accountStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("ad_groups_owner_idx").on(t.ownerId)],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    kind: mediaTypeEnum("kind").notNull(),
    storageKey: varchar("storage_key", { length: 300 }).notNull().unique(),
    mime: varchar("mime", { length: 100 }).notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    durationMs: integer("duration_ms"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("assets_owner_idx").on(t.ownerId)],
);

export const ads = pgTable(
  "ads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    accountId: uuid("group_id").notNull().references(() => adAccounts.id, { onDelete: "restrict" }),
    sponsorId: uuid("sponsor_id").notNull().references(() => sponsors.id, { onDelete: "restrict" }),
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "restrict" }),
    /** The file the editor started from (images are baked into `assetId`); null for videos and plain uploads. */
    sourceAssetId: uuid("source_asset_id").references(() => assets.id, { onDelete: "set null" }),
    layout: jsonb("layout").$type<MediaLayout>(),
    title: varchar("title", { length: 160 }).notNull(),
    placement: placementEnum("placement").notNull(),
    mediaType: mediaTypeEnum("media_type").notNull(),
    weight: integer("weight").notNull().default(1),
    displaySeconds: integer("display_seconds"),
    status: adStatusEnum("status").notNull().default("DRAFT"),
    /** Relevance: see src/lib/targeting.ts. Empty targeting shows everywhere. */
    category: varchar("category", { length: 30 }),
    targetCountries: text("target_countries").array().notNull().default(sql`'{}'::text[]`),
    targetRegions: text("target_regions").array().notNull().default(sql`'{}'::text[]`),
    targetCities: text("target_cities").array().notNull().default(sql`'{}'::text[]`),
    targetRadius: jsonb("target_radius").$type<Radius>(),
    targetStrict: boolean("target_strict").notNull().default(false),
    startsAt: ts("starts_at"),
    endsAt: ts("ends_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("ads_owner_idx").on(t.ownerId),
    index("ads_group_idx").on(t.accountId),
    index("ads_serve_idx").on(t.accountId, t.placement, t.status),
    check("ads_no_poster_video", sql`NOT (${t.placement} = 'POSTER_FOOTER' AND ${t.mediaType} = 'VIDEO')`),
    check("ads_weight_range", sql`${t.weight} BETWEEN 1 AND 100`),
    check(
      "ads_display_seconds_rule",
      sql`((${t.placement} <> 'POSTER_FOOTER' AND ${t.mediaType} = 'IMAGE') = (${t.displaySeconds} IS NOT NULL))`,
    ),
    check("ads_schedule_order", sql`${t.endsAt} IS NULL OR ${t.startsAt} IS NULL OR ${t.endsAt} > ${t.startsAt}`),
  ],
);
