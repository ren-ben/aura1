ALTER TABLE "courses" ADD COLUMN "exams" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "refreshed_at" timestamp with time zone DEFAULT now() NOT NULL;