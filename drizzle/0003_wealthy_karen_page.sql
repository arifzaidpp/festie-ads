ALTER TABLE "assets" RENAME COLUMN "r2_key" TO "storage_key";--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT "assets_r2_key_unique";--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_storage_key_unique" UNIQUE("storage_key");