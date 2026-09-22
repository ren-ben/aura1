CREATE TABLE "device" (
	"id" integer PRIMARY KEY NOT NULL,
	"last_sync_at" timestamp with time zone,
	"battery" integer,
	"millivolts" integer,
	"charging" boolean,
	"look" text,
	"pending_look" text
);
