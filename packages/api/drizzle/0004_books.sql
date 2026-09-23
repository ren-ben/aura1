CREATE TABLE "books" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"format" text NOT NULL,
	"words" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"chapter_idx" integer DEFAULT 0 NOT NULL,
	"through" integer DEFAULT 0 NOT NULL,
	"read_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_id" integer NOT NULL REFERENCES "books"("id"),
	"idx" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marks" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_id" integer NOT NULL REFERENCES "books"("id"),
	"chapter_idx" integer NOT NULL,
	"start" integer NOT NULL,
	"end" integer NOT NULL,
	"body" text NOT NULL,
	"note" text,
	"source" text DEFAULT 'web' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "chapters_book_idx" ON "chapters" ("book_id", "idx");
--> statement-breakpoint
CREATE INDEX "marks_book_idx" ON "marks" ("book_id", "chapter_idx");
