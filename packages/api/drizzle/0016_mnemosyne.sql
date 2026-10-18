CREATE TABLE "topic_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ground" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_id" integer NOT NULL,
	"to_id" integer NOT NULL,
	CONSTRAINT "topic_links_from_id_to_id_unique" UNIQUE("from_id","to_id")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer,
	"title" text NOT NULL,
	"points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"fsrs" jsonb,
	"due" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "topic_links" ADD CONSTRAINT "topic_links_from_id_topics_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_links" ADD CONSTRAINT "topic_links_to_id_topics_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_group_id_topic_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."topic_groups"("id") ON DELETE set null ON UPDATE no action;