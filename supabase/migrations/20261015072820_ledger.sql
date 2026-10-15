CREATE TYPE "public"."ledger_account_type" AS ENUM('cash', 'tenant', 'owner', 'fees', 'admin_charges', 'third_party', 'other_income', 'expenses');--> statement-breakpoint
CREATE TYPE "public"."ledger_direction" AS ENUM('debit', 'credit');--> statement-breakpoint
ALTER TYPE "public"."charge_type" ADD VALUE 'credit_balance';--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" "ledger_account_type" NOT NULL,
	"ref_id" uuid,
	"currency" char(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"posting_id" uuid NOT NULL,
	"movement_id" uuid,
	"charge_id" uuid,
	"account_id" uuid NOT NULL,
	"direction" "ledger_direction" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" char(3) NOT NULL,
	"date" date NOT NULL,
	"concept" text NOT NULL,
	"reversal_of_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amount" CHECK ("ledger_entries"."amount" > 0),
	CONSTRAINT "ledger_entries_source" CHECK (("ledger_entries"."movement_id" is null) <> ("ledger_entries"."charge_id" is null))
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "movements" ADD COLUMN "to_cash_account_id" uuid;--> statement-breakpoint
ALTER TABLE "movements" ADD COLUMN "owner_direct_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_movement_id_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_accounts_organization_idx" ON "ledger_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_date_idx" ON "ledger_entries" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "ledger_entries_posting_idx" ON "ledger_entries" USING btree ("posting_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_movement_idx" ON "ledger_entries" USING btree ("movement_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_charge_idx" ON "ledger_entries" USING btree ("charge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_reversed_once" ON "ledger_entries" USING btree ("reversal_of_id");--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_to_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("to_cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE restrict ON UPDATE no action;