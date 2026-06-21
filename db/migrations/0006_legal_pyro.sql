ALTER TABLE "project" ADD COLUMN "application_url" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "report_version" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "test_accounts" json;--> statement-breakpoint
ALTER TABLE "user_account" ADD COLUMN "organization_name" text;