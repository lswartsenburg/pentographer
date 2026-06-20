CREATE TABLE "report_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"blob_url" text NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "report_template_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "report_template" ADD CONSTRAINT "report_template_user_id_user_account_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_account"("id") ON DELETE cascade ON UPDATE no action;