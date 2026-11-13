CREATE TYPE "public"."ad_status" AS ENUM('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."group_status" AS ENUM('ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('IMAGE', 'VIDEO');--> statement-breakpoint
CREATE TYPE "public"."placement" AS ENUM('POSTER_FOOTER', 'SCREEN_FOOTER', 'SCREEN_FULLSCREEN');--> statement-breakpoint
CREATE TYPE "public"."rate_unit" AS ENUM('PER_DOWNLOAD', 'PER_HOUR_DISPLAYED', 'PER_HOUR_WATCHED');--> statement-breakpoint
CREATE TABLE "ad_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"status" "group_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"group_id" uuid NOT NULL,
	"sponsor_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"placement" "placement" NOT NULL,
	"media_type" "media_type" NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"display_seconds" integer,
	"status" "ad_status" DEFAULT 'DRAFT' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ads_no_poster_video" CHECK (NOT ("ads"."placement" = 'POSTER_FOOTER' AND "ads"."media_type" = 'VIDEO')),
	CONSTRAINT "ads_weight_range" CHECK ("ads"."weight" BETWEEN 1 AND 100),
	CONSTRAINT "ads_display_seconds_rule" CHECK ((("ads"."placement" <> 'POSTER_FOOTER' AND "ads"."media_type" = 'IMAGE') = ("ads"."display_seconds" IS NOT NULL))),
	CONSTRAINT "ads_schedule_order" CHECK ("ads"."ends_at" IS NULL OR "ads"."starts_at" IS NULL OR "ads"."ends_at" > "ads"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"kind" "media_type" NOT NULL,
	"r2_key" varchar(300) NOT NULL,
	"mime" varchar(100) NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_r2_key_unique" UNIQUE("r2_key")
);
--> statement-breakpoint
CREATE TABLE "price_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"placement" "placement" NOT NULL,
	"media_type" "media_type" NOT NULL,
	"unit" "rate_unit" NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"effective_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_rates_owner_combo_from_uq" UNIQUE("owner_id","placement","media_type","effective_from"),
	CONSTRAINT "price_rates_no_poster_video" CHECK (NOT ("price_rates"."placement" = 'POSTER_FOOTER' AND "price_rates"."media_type" = 'VIDEO')),
	CONSTRAINT "price_rates_amount_nonneg" CHECK ("price_rates"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sponsors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"contact_email" varchar(200),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_groups" ADD CONSTRAINT "ad_groups_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_group_id_ad_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."ad_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_rates" ADD CONSTRAINT "price_rates_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_groups_owner_idx" ON "ad_groups" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "ads_owner_idx" ON "ads" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "ads_group_idx" ON "ads" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "ads_serve_idx" ON "ads" USING btree ("group_id","placement","status");--> statement-breakpoint
CREATE INDEX "assets_owner_idx" ON "assets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "sponsors_owner_idx" ON "sponsors" USING btree ("owner_id");