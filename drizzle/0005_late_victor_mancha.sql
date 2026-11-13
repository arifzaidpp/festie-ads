CREATE TYPE "public"."event_kind" AS ENUM('POSTER_GENERATED', 'POSTER_DOWNLOADED', 'SCREEN_DISPLAY_MS', 'VIDEO_WATCH_MS');--> statement-breakpoint
CREATE TABLE "ad_daily_stats" (
	"date_utc" date NOT NULL,
	"ad_id" uuid NOT NULL,
	"sub_fest_id" varchar(64) NOT NULL,
	"placement" "placement" NOT NULL,
	"media_type" "media_type" NOT NULL,
	"poster_generated" integer DEFAULT 0 NOT NULL,
	"poster_downloads" integer DEFAULT 0 NOT NULL,
	"display_ms" integer DEFAULT 0 NOT NULL,
	"watch_ms" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_daily_stats_date_utc_ad_id_sub_fest_id_pk" PRIMARY KEY("date_utc","ad_id","sub_fest_id")
);
--> statement-breakpoint
CREATE TABLE "ad_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"connection_id" uuid NOT NULL,
	"ad_id" uuid NOT NULL,
	"sub_fest_id" varchar(64) NOT NULL,
	"placement" "placement" NOT NULL,
	"media_type" "media_type" NOT NULL,
	"kind" "event_kind" NOT NULL,
	"value" integer NOT NULL,
	"session_id" varchar(80),
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_events_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "ad_events_value_range" CHECK ("ad_events"."value" BETWEEN 0 AND 600000)
);
--> statement-breakpoint
ALTER TABLE "ad_daily_stats" ADD CONSTRAINT "ad_daily_stats_ad_id_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_events" ADD CONSTRAINT "ad_events_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_events" ADD CONSTRAINT "ad_events_ad_id_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_daily_stats_ad_idx" ON "ad_daily_stats" USING btree ("ad_id");--> statement-breakpoint
CREATE INDEX "ad_events_day_idx" ON "ad_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "ad_events_ad_idx" ON "ad_events" USING btree ("ad_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ad_events_conn_received_idx" ON "ad_events" USING btree ("connection_id","received_at");