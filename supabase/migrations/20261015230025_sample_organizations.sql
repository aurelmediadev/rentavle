ALTER TABLE "organizations" ADD COLUMN "is_sample" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "sample_of" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_sample_of_organizations_id_fk" FOREIGN KEY ("sample_of") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;