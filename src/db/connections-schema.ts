import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { adAccounts } from "./ads-schema";

export const connectionStatusEnum = pgEnum("connection_status", ["ACTIVE", "REVOKED"]);

const ts = (name: string) => timestamp(name, { withTimezone: true });

/** A product that hosts ads (festie today). Mirrors the app registered in its Control. */
export const clientApps = pgTable("client_apps", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  adminUrl: varchar("admin_url", { length: 300 }).notNull(),
  apiUrl: varchar("api_url", { length: 300 }).notNull(),
  clientId: varchar("client_id", { length: 100 }).notNull(),
  clientSecretEnc: text("client_secret_enc").notNull(),
  /** Used from M4 to sign requests from festie to this engine. */
  signingSecretEnc: text("signing_secret_enc"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** One ad group connected to one festival of a client app. `external_ref` sent to festie is the group id. */
export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("group_id").notNull().unique().references(() => adAccounts.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    clientAppId: uuid("client_app_id").notNull().references(() => clientApps.id, { onDelete: "restrict" }),
    festivalId: varchar("festival_id", { length: 64 }).notNull(),
    festivalName: varchar("festival_name", { length: 200 }).notNull(),
    tokenEnc: text("token_enc").notNull(),
    status: connectionStatusEnum("status").notNull().default("ACTIVE"),
    connectedAt: ts("connected_at").notNull().defaultNow(),
    revokedAt: ts("revoked_at"),
    lastCheckedAt: ts("last_checked_at"),
  },
  (t) => [
    index("connections_owner_idx").on(t.ownerId),
    // A festival has at most one active ad account, across all owners.
    uniqueIndex("connections_festival_active_uq")
      .on(t.festivalId)
      .where(sql`${t.status} = 'ACTIVE'`),
  ],
);

export const connectionFests = pgTable(
  "connection_fests",
  {
    connectionId: uuid("connection_id").notNull().references(() => connections.id, { onDelete: "cascade" }),
    subFestId: varchar("sub_fest_id", { length: 64 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }),
    timeZone: varchar("time_zone", { length: 80 }),
  },
  (t) => [primaryKey({ columns: [t.connectionId, t.subFestId] })],
);
