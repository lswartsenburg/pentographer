-- Drop old FKs that need to change
ALTER TABLE "api_key" DROP CONSTRAINT "api_key_user_id_user_account_id_fk";--> statement-breakpoint
ALTER TABLE "oauth_client" DROP CONSTRAINT "oauth_client_user_id_user_account_id_fk";--> statement-breakpoint

-- Make userId nullable (becomes createdBy tracking only)
ALTER TABLE "api_key" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_client" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint

-- Add new columns as nullable first so backfill can run
ALTER TABLE "api_key" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "oauth_client" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "organization_id" uuid;--> statement-breakpoint

-- ── Backfill: set organizationId from the key owner's personal org ────────────

UPDATE "api_key" SET organization_id = ua.personal_org_id
FROM "user_account" ua WHERE ua.id = "api_key".user_id;--> statement-breakpoint

UPDATE "oauth_client" SET organization_id = ua.personal_org_id
FROM "user_account" ua WHERE ua.id = "oauth_client".user_id;--> statement-breakpoint

UPDATE "audit_log" SET organization_id = ua.personal_org_id
FROM "user_account" ua WHERE ua.id = "audit_log".user_id;--> statement-breakpoint

-- ── Add NOT NULL constraints now that rows are backfilled ─────────────────────
ALTER TABLE "api_key" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_client" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
-- audit_log stays nullable (rows with null user_id stay null)

-- ── Restore / add FKs ─────────────────────────────────────────────────────────
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_user_id_user_account_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client" ADD CONSTRAINT "oauth_client_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client" ADD CONSTRAINT "oauth_client_user_id_user_account_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE no action;
