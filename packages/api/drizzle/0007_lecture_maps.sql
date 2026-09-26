CREATE TABLE "lecture_maps" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"begin" text NOT NULL,
	"topic" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"notes" text,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"map" jsonb,
	"grown" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lecture_maps_course_id_begin_unique" UNIQUE("course_id","begin")
);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "syllabus" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "lecture_maps" ADD CONSTRAINT "lecture_maps_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;