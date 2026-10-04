CREATE TABLE "own_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"note_id" integer NOT NULL,
	"ord" integer NOT NULL,
	"fsrs" jsonb NOT NULL,
	"due" timestamp with time zone NOT NULL,
	CONSTRAINT "own_cards_note_id_ord_unique" UNIQUE("note_id","ord")
);
--> statement-breakpoint
CREATE TABLE "own_decks" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "own_decks_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "own_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "own_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"deck_id" integer NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fields" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "own_cards" ADD CONSTRAINT "own_cards_note_id_own_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."own_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "own_notes" ADD CONSTRAINT "own_notes_deck_id_own_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."own_decks"("id") ON DELETE cascade ON UPDATE no action;