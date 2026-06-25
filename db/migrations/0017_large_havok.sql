CREATE TABLE "oauth_auth_code" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text,
	"code_challenge_method" text,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	CONSTRAINT "oauth_auth_code_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "oauth_auth_code" ADD CONSTRAINT "oauth_auth_code_user_id_user_account_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_auth_code" ADD CONSTRAINT "oauth_auth_code_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;