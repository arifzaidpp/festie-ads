DROP INDEX "connections_owner_festival_active_uq";--> statement-breakpoint
-- A festival keeps only its earliest active connection; later duplicates are revoked (the owner can reconnect elsewhere).
UPDATE "connections" c SET "status" = 'REVOKED', "revoked_at" = now()
WHERE c."status" = 'ACTIVE' AND EXISTS (
  SELECT 1 FROM "connections" o
  WHERE o."festival_id" = c."festival_id" AND o."status" = 'ACTIVE' AND o."id" <> c."id"
    AND (o."connected_at", o."id") < (c."connected_at", c."id")
);--> statement-breakpoint
CREATE UNIQUE INDEX "connections_festival_active_uq" ON "connections" USING btree ("festival_id") WHERE "connections"."status" = 'ACTIVE';