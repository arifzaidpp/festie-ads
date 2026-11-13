import { date, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** One row per nightly rollup day, so the cron is idempotent. */
export const rollupRuns = pgTable("rollup_runs", {
  dateUtc: date("date_utc").primaryKey(),
  status: text("status", { enum: ["RUNNING", "DONE", "FAILED"] }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export * from "./auth-schema";
export * from "./ads-schema";
export * from "./connections-schema";
export * from "./events-schema";
