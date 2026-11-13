CREATE TABLE "ad_daily_breakdown" (
	"date_utc" date NOT NULL,
	"ad_id" uuid NOT NULL,
	"sub_fest_id" varchar(64) NOT NULL,
	"hour_utc" smallint NOT NULL,
	"screen_key" varchar(80) DEFAULT '' NOT NULL,
	"country" char(2) DEFAULT '' NOT NULL,
	"region" varchar(100) DEFAULT '' NOT NULL,
	"city" varchar(100) DEFAULT '' NOT NULL,
	"lat_e2" integer DEFAULT 0 NOT NULL,
	"lon_e2" integer DEFAULT 0 NOT NULL,
	"device_type" varchar(16) DEFAULT '' NOT NULL,
	"os" varchar(40) DEFAULT '' NOT NULL,
	"browser" varchar(40) DEFAULT '' NOT NULL,
	"placement" "placement" NOT NULL,
	"media_type" "media_type" NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"display_ms" integer DEFAULT 0 NOT NULL,
	"watch_ms" integer DEFAULT 0 NOT NULL,
	"poster_generated" integer DEFAULT 0 NOT NULL,
	"poster_downloads" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_daily_breakdown_date_utc_ad_id_sub_fest_id_hour_utc_screen_key_country_region_city_lat_e2_lon_e2_device_type_os_browser_pk" PRIMARY KEY("date_utc","ad_id","sub_fest_id","hour_utc","screen_key","country","region","city","lat_e2","lon_e2","device_type","os","browser")
);
--> statement-breakpoint
ALTER TABLE "price_rates" DROP CONSTRAINT "price_rates_owner_combo_from_uq";--> statement-breakpoint
ALTER TABLE "ads" ADD COLUMN "source_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "ads" ADD COLUMN "layout" jsonb;--> statement-breakpoint
ALTER TABLE "price_rates" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "sponsors" ADD COLUMN "account_id" uuid;--> statement-breakpoint
-- Sponsors and prices now belong to an ad account. Existing rows go to the owner's oldest account
-- (one is created for an owner who has sponsors or prices but no account yet).
INSERT INTO "ad_groups" ("owner_id", "name")
  SELECT o."owner_id", 'My account'
  FROM (SELECT "owner_id" FROM "sponsors" UNION SELECT "owner_id" FROM "price_rates") o
  WHERE NOT EXISTS (SELECT 1 FROM "ad_groups" g WHERE g."owner_id" = o."owner_id");--> statement-breakpoint
UPDATE "sponsors" s SET "account_id" = (SELECT g."id" FROM "ad_groups" g WHERE g."owner_id" = s."owner_id" ORDER BY g."created_at" LIMIT 1);--> statement-breakpoint
UPDATE "price_rates" r SET "account_id" = (SELECT g."id" FROM "ad_groups" g WHERE g."owner_id" = r."owner_id" ORDER BY g."created_at" LIMIT 1);--> statement-breakpoint
ALTER TABLE "sponsors" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "price_rates" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_events" ADD COLUMN "screen_key" varchar(80);--> statement-breakpoint
ALTER TABLE "ad_events" ADD COLUMN "country" char(2);--> statement-breakpoint
ALTER TABLE "ad_events" ADD COLUMN "region" varchar(100);--> statement-breakpoint
ALTER TABLE "ad_events" ADD COLUMN "city" varchar(100);--> statement-breakpoint
ALTER TABLE "ad_events" ADD COLUMN "lat" real;--> statement-breakpoint
ALTER TABLE "ad_events" ADD COLUMN "lon" real;--> statement-breakpoint
ALTER TABLE "ad_events" ADD COLUMN "device_type" varchar(16);--> statement-breakpoint
ALTER TABLE "ad_events" ADD COLUMN "os" varchar(40);--> statement-breakpoint
ALTER TABLE "ad_events" ADD COLUMN "browser" varchar(40);--> statement-breakpoint
ALTER TABLE "ad_daily_breakdown" ADD CONSTRAINT "ad_daily_breakdown_ad_id_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_daily_breakdown_ad_idx" ON "ad_daily_breakdown" USING btree ("ad_id","date_utc");--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_rates" ADD CONSTRAINT "price_rates_account_id_ad_groups_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ad_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_account_id_ad_groups_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ad_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sponsors_account_idx" ON "sponsors" USING btree ("account_id");--> statement-breakpoint
ALTER TABLE "price_rates" ADD CONSTRAINT "price_rates_account_combo_from_uq" UNIQUE("account_id","placement","media_type","effective_from");