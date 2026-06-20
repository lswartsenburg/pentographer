ALTER TABLE "playbook_version" ADD COLUMN "status" text DEFAULT 'draft' NOT NULL;
UPDATE "playbook_version" SET "status" = 'published';
