CREATE TYPE "public"."org_role" AS ENUM('owner', 'admin', 'member', 'viewer');--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "org_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_member_organization_id_user_id_unique" UNIQUE("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_member_team_id_user_id_unique" UNIQUE("team_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_user_id_user_account_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_user_id_user_account_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Drop old FKs that need to be recreated with ON DELETE set null
ALTER TABLE "customer" DROP CONSTRAINT "customer_user_id_user_account_id_fk";--> statement-breakpoint
ALTER TABLE "playbook" DROP CONSTRAINT "playbook_user_id_user_account_id_fk";--> statement-breakpoint
ALTER TABLE "project" DROP CONSTRAINT "project_user_id_user_account_id_fk";--> statement-breakpoint
ALTER TABLE "report_template" DROP CONSTRAINT "report_template_user_id_user_account_id_fk";--> statement-breakpoint

-- Make userId nullable (it becomes createdBy tracking only)
ALTER TABLE "customer" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "report_template" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint

-- Add organization_id as nullable initially so backfill can run on existing rows
ALTER TABLE "customer" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "playbook" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "report_template" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "user_account" ADD COLUMN "personal_org_id" uuid;--> statement-breakpoint

-- ── Backfill: create a personal org for every existing user ──────────────────

-- 1. Insert one org per user (name from organization_name field or "{name}'s Workspace")
INSERT INTO "organization" ("id", "name", "created_at")
SELECT
  gen_random_uuid(),
  COALESCE(NULLIF(TRIM(ua.organization_name), ''), ua.name || '''s Workspace'),
  now()
FROM "user_account" ua;

-- 2. Match each user to their new org by name and set personal_org_id
--    (two users with the identical org name get different orgs — we match on user pk via a temp column)
ALTER TABLE "user_account" ADD COLUMN "_org_name_tmp" text;--> statement-breakpoint
UPDATE "user_account"
SET "_org_name_tmp" = COALESCE(NULLIF(TRIM(organization_name), ''), name || '''s Workspace');--> statement-breakpoint

WITH ranked AS (
  SELECT
    ua.id AS user_id,
    o.id  AS org_id,
    ROW_NUMBER() OVER (PARTITION BY ua.id ORDER BY o.created_at DESC) AS rn
  FROM "user_account" ua
  JOIN "organization" o
    ON o.name = ua."_org_name_tmp"
   AND o.created_at >= (now() - interval '5 seconds')
)
UPDATE "user_account" ua
SET personal_org_id = r.org_id
FROM ranked r
WHERE r.user_id = ua.id AND r.rn = 1;--> statement-breakpoint

ALTER TABLE "user_account" DROP COLUMN "_org_name_tmp";--> statement-breakpoint

-- 3. Create owner membership for every user
INSERT INTO "organization_member" ("id", "organization_id", "user_id", "role", "created_at")
SELECT gen_random_uuid(), ua.personal_org_id, ua.id, 'owner', now()
FROM "user_account" ua
WHERE ua.personal_org_id IS NOT NULL;--> statement-breakpoint

-- 4. Backfill organization_id on resource tables
UPDATE "customer" SET organization_id = ua.personal_org_id
FROM "user_account" ua WHERE ua.id = "customer".user_id;--> statement-breakpoint

UPDATE "project" SET organization_id = ua.personal_org_id
FROM "user_account" ua WHERE ua.id = "project".user_id;--> statement-breakpoint

UPDATE "report_template" SET organization_id = ua.personal_org_id
FROM "user_account" ua WHERE ua.id = "report_template".user_id;--> statement-breakpoint

-- Org-owned playbooks: backfill from user_id; system playbooks (user_id IS NULL) stay null
UPDATE "playbook" SET organization_id = ua.personal_org_id
FROM "user_account" ua WHERE ua.id = "playbook".user_id;--> statement-breakpoint

-- ── Add NOT NULL constraints now that all rows are backfilled ─────────────────
ALTER TABLE "customer" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "report_template" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint

-- ── Restore FKs ───────────────────────────────────────────────────────────────
ALTER TABLE "customer" ADD CONSTRAINT "customer_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_user_id_user_account_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook" ADD CONSTRAINT "playbook_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook" ADD CONSTRAINT "playbook_user_id_user_account_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_user_id_user_account_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_template" ADD CONSTRAINT "report_template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_template" ADD CONSTRAINT "report_template_user_id_user_account_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_account" ADD CONSTRAINT "user_account_personal_org_id_organization_id_fk" FOREIGN KEY ("personal_org_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;
