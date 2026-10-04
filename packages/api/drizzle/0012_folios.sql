CREATE TABLE "decks" (
	"id" serial PRIMARY KEY NOT NULL,
	"nr" text NOT NULL,
	"semester" text NOT NULL,
	"cmid" integer NOT NULL,
	"instance" integer NOT NULL,
	"name" text NOT NULL,
	"boxes" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decks_cmid_unique" UNIQUE("cmid")
);
--> statement-breakpoint
CREATE TABLE "folio_files" (
	"folio_id" integer PRIMARY KEY NOT NULL,
	"pdf" "bytea" NOT NULL,
	"texts" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folios" (
	"id" serial PRIMARY KEY NOT NULL,
	"nr" text NOT NULL,
	"semester" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"moodle_url" text,
	"section" text,
	"size" integer NOT NULL,
	"pages" integer NOT NULL,
	"outline" jsonb NOT NULL,
	"modified_at" timestamp with time zone NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "folios_moodle_url_unique" UNIQUE("moodle_url")
);
--> statement-breakpoint
CREATE TABLE "moodle" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"username" text NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"flashcards_token" text,
	"private_token" text,
	"bound_at" timestamp with time zone DEFAULT now() NOT NULL,
	"synced_at" timestamp with time zone,
	"refused_at" timestamp with time zone,
	"courses" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "folio_files" ADD CONSTRAINT "folio_files_folio_id_folios_id_fk" FOREIGN KEY ("folio_id") REFERENCES "public"."folios"("id") ON DELETE cascade ON UPDATE no action;