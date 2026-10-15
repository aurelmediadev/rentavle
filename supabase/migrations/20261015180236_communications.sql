CREATE TYPE "public"."communication_channel" AS ENUM('email', 'whatsapp_link');--> statement-breakpoint
CREATE TYPE "public"."communication_sender" AS ENUM('manual', 'automatic');--> statement-breakpoint
CREATE TYPE "public"."communication_status" AS ENUM('queued', 'sent', 'delivered', 'bounced', 'failed');--> statement-breakpoint
CREATE TYPE "public"."communication_type" AS ENUM('receipt', 'settlement', 'payment_reminder', 'late_notice', 'amount_update', 'contract_expiry');--> statement-breakpoint
CREATE TYPE "public"."template_channel" AS ENUM('email', 'whatsapp');--> statement-breakpoint
CREATE TABLE "communications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contract_id" uuid,
	"client_id" uuid,
	"movement_id" uuid,
	"type" "communication_type" NOT NULL,
	"channel" "communication_channel" NOT NULL,
	"sender" "communication_sender" NOT NULL,
	"to_address" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"status" "communication_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"dedupe_key" text,
	"sent_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "communications_automatic_dedupe" CHECK ("communications"."sender" = 'manual' or "communications"."dedupe_key" is not null)
);
--> statement-breakpoint
ALTER TABLE "communications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" "communication_type" NOT NULL,
	"channel" "template_channel" NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_templates_body" CHECK (length(trim("message_templates"."body")) > 0)
);
--> statement-breakpoint
ALTER TABLE "message_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_movement_id_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "communications_dedupe_key" ON "communications" USING btree ("organization_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "communications_contract_idx" ON "communications" USING btree ("contract_id","created_at");--> statement-breakpoint
CREATE INDEX "communications_client_idx" ON "communications" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "communications_movement_idx" ON "communications" USING btree ("movement_id");--> statement-breakpoint
CREATE INDEX "communications_provider_idx" ON "communications" USING btree ("provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_templates_key" ON "message_templates" USING btree ("organization_id","type","channel");