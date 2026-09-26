CREATE TABLE "blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"start" integer NOT NULL,
	"end" integer NOT NULL,
	"title" text NOT NULL,
	"shade" integer DEFAULT 1 NOT NULL,
	"activity_id" integer
);
--> statement-breakpoint
CREATE TABLE "plan_days" (
	"date" date PRIMARY KEY NOT NULL,
	"rev" integer DEFAULT 0 NOT NULL,
	"capacity" integer DEFAULT 480 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action;