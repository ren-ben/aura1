CREATE TABLE "exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"muscle_group" text NOT NULL,
	"sets" integer NOT NULL,
	"rep_lo" integer NOT NULL,
	"rep_hi" integer NOT NULL,
	"step" double precision NOT NULL,
	"bw_share" double precision DEFAULT 0 NOT NULL,
	"path" double precision NOT NULL,
	"pose" text NOT NULL,
	"rest" integer NOT NULL,
	"start" double precision NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "garmin_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"seconds" integer NOT NULL,
	"meters" double precision NOT NULL,
	"ascent" double precision NOT NULL,
	"hr_avg" integer,
	"hr_max" integer,
	"kj" double precision NOT NULL,
	"load" double precision,
	"zones" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "garmin_days" (
	"date" date PRIMARY KEY NOT NULL,
	"readiness" integer,
	"hrv_status" text,
	"sleep_score" integer,
	"body_battery" integer,
	"resting_hr" integer,
	"acute_load" double precision,
	"chronic_load" double precision
);
--> statement-breakpoint
CREATE TABLE "hunt_feels" (
	"exercise_id" integer NOT NULL,
	"date" date NOT NULL,
	"feel" text NOT NULL,
	CONSTRAINT "hunt_feels_exercise_id_date_pk" PRIMARY KEY("exercise_id","date")
);
--> statement-breakpoint
CREATE TABLE "hunt_sets" (
	"uuid" text PRIMARY KEY NOT NULL,
	"exercise_id" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"idx" integer NOT NULL,
	"load" double precision NOT NULL,
	"reps" integer NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hunt_feels" ADD CONSTRAINT "hunt_feels_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hunt_sets" ADD CONSTRAINT "hunt_sets_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;