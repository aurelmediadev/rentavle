CREATE TYPE "public"."cash_account_type" AS ENUM('cash', 'bank');--> statement-breakpoint
CREATE TYPE "public"."movement_type" AS ENUM('tenant_payment', 'owner_settlement', 'manual_income', 'manual_expense', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'transfer_to_admin', 'transfer_to_owner', 'split_transfer', 'online');--> statement-breakpoint
CREATE TABLE "cash_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" "cash_account_type" NOT NULL,
	"name" text NOT NULL,
	"currency" char(3) NOT NULL,
	"bank_account_id" uuid,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_accounts_name" CHECK (length(trim("cash_accounts"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "cash_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "charge_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"movement_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "charge_allocations_nonzero" CHECK ("charge_allocations"."amount" <> 0)
);
--> statement-breakpoint
ALTER TABLE "charge_allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" integer DEFAULT 0 NOT NULL,
	"type" "movement_type" NOT NULL,
	"date" date NOT NULL,
	"contract_id" uuid,
	"client_id" uuid,
	"method" "payment_method" NOT NULL,
	"cash_account_id" uuid,
	"amount" numeric(14, 2) NOT NULL,
	"currency" char(3) NOT NULL,
	"notes" text,
	"reversed_at" timestamp with time zone,
	"reversed_by" uuid,
	"reverse_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movements_amount" CHECK ("movements"."amount" >= 0),
	CONSTRAINT "movements_reversal" CHECK (("movements"."reversed_at" is null) = ("movements"."reverse_reason" is null))
);
--> statement-breakpoint
ALTER TABLE "movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_allocations" ADD CONSTRAINT "charge_allocations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_allocations" ADD CONSTRAINT "charge_allocations_movement_id_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_allocations" ADD CONSTRAINT "charge_allocations_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_accounts_organization_idx" ON "cash_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "charge_allocations_movement_charge_key" ON "charge_allocations" USING btree ("movement_id","charge_id");--> statement-breakpoint
CREATE INDEX "charge_allocations_charge_idx" ON "charge_allocations" USING btree ("charge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "movements_organization_number_key" ON "movements" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "movements_contract_idx" ON "movements" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "movements_organization_date_idx" ON "movements" USING btree ("organization_id","date");