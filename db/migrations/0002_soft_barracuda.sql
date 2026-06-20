ALTER TABLE "report_template" DROP CONSTRAINT "report_template_user_id_unique";--> statement-breakpoint
ALTER TABLE "report_template" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "report_template" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "report_template" ADD COLUMN "download_count" integer DEFAULT 0 NOT NULL;