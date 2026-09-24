CREATE TABLE "courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"nr" text NOT NULL,
	"semester" text NOT NULL,
	"module" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"ects" integer NOT NULL,
	"groups" jsonb NOT NULL,
	"group_id" text,
	"grade" integer,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_nr_semester_unique" UNIQUE("nr","semester")
);
--> statement-breakpoint
CREATE TABLE "vigil_signs" (
	"sign" text PRIMARY KEY NOT NULL,
	"kept_at" timestamp with time zone DEFAULT now() NOT NULL
);
