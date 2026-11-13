ALTER TABLE "ads" ADD COLUMN "category" varchar(30);--> statement-breakpoint
ALTER TABLE "ads" ADD COLUMN "target_countries" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "ads" ADD COLUMN "target_regions" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "ads" ADD COLUMN "target_cities" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "ads" ADD COLUMN "target_radius" jsonb;--> statement-breakpoint
ALTER TABLE "ads" ADD COLUMN "target_strict" boolean DEFAULT false NOT NULL;