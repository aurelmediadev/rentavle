CREATE TYPE "public"."file_entity_type" AS ENUM('contract', 'movement', 'client', 'property');--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" "file_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_size" CHECK ("files"."size_bytes" > 0 and "files"."size_bytes" <= 10485760)
);
--> statement-breakpoint
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "files_storage_path_key" ON "files" USING btree ("storage_path");--> statement-breakpoint
CREATE INDEX "files_entity_idx" ON "files" USING btree ("entity_type","entity_id");--> statement-breakpoint
ALTER TABLE "contracts" DROP COLUMN "file_path";