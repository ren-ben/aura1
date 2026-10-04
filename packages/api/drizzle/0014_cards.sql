CREATE TABLE "cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"deck_id" integer NOT NULL,
	"qid" integer NOT NULL,
	"name" text NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"box" integer NOT NULL,
	"pending" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answered_at" timestamp with time zone,
	CONSTRAINT "cards_deck_id_qid_unique" UNIQUE("deck_id","qid")
);
--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;