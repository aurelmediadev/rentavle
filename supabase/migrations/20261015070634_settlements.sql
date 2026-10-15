ALTER TYPE "public"."payment_method" ADD VALUE 'transfer_from_admin';--> statement-breakpoint
CREATE TABLE "settlement_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"settlement_id" uuid NOT NULL,
	"allocation_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"share_pct" numeric(5, 2) NOT NULL,
	"gross" numeric(14, 2) NOT NULL,
	"fee" numeric(14, 2) NOT NULL,
	"payout" numeric(14, 2) NOT NULL,
	"fee_owed" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlement_lines_amounts" CHECK ("settlement_lines"."fee" >= 0 and "settlement_lines"."payout" >= 0 and "settlement_lines"."fee_owed" >= 0)
);
--> statement-breakpoint
ALTER TABLE "settlement_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_settlement_id_movements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."movements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_allocation_id_charge_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."charge_allocations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "settlement_lines_settlement_idx" ON "settlement_lines" USING btree ("settlement_id");--> statement-breakpoint
CREATE INDEX "settlement_lines_allocation_idx" ON "settlement_lines" USING btree ("allocation_id","client_id");