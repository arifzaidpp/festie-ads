CREATE TYPE "public"."connection_status" AS ENUM('ACTIVE', 'REVOKED');--> statement-breakpoint
CREATE TABLE "client_apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"admin_url" varchar(300) NOT NULL,
	"api_url" varchar(300) NOT NULL,
	"client_id" varchar(100) NOT NULL,
	"client_secret_enc" text NOT NULL,
	"signing_secret_enc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_apps_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "connection_fests" (
	"connection_id" uuid NOT NULL,
	"sub_fest_id" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(200),
	"time_zone" varchar(80),
	CONSTRAINT "connection_fests_connection_id_sub_fest_id_pk" PRIMARY KEY("connection_id","sub_fest_id")
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"client_app_id" uuid NOT NULL,
	"festival_id" varchar(64) NOT NULL,
	"festival_name" varchar(200) NOT NULL,
	"token_enc" text NOT NULL,
	"status" "connection_status" DEFAULT 'ACTIVE' NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	CONSTRAINT "connections_group_id_unique" UNIQUE("group_id")
);
--> statement-breakpoint
ALTER TABLE "connection_fests" ADD CONSTRAINT "connection_fests_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_group_id_ad_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."ad_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_client_app_id_client_apps_id_fk" FOREIGN KEY ("client_app_id") REFERENCES "public"."client_apps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connections_owner_idx" ON "connections" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_owner_festival_active_uq" ON "connections" USING btree ("owner_id","festival_id") WHERE "connections"."status" = 'ACTIVE';