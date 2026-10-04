CREATE TABLE "asks" (
	"id" serial PRIMARY KEY NOT NULL,
	"nr" text NOT NULL,
	"semester" text NOT NULL,
	"kind" text NOT NULL,
	"question" text NOT NULL,
	"folio_id" integer,
	"task" integer,
	"rung" integer,
	"status" text NOT NULL,
	"answer" text,
	"error" text,
	"cites" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lecture_maps" ADD COLUMN "pages" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "asks" ADD CONSTRAINT "asks_folio_id_folios_id_fk" FOREIGN KEY ("folio_id") REFERENCES "public"."folios"("id") ON DELETE cascade ON UPDATE no action;