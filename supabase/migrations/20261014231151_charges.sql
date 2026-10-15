CREATE TYPE "public"."charge_party" AS ENUM('tenant', 'owner', 'administration', 'third_party');--> statement-breakpoint
CREATE TYPE "public"."charge_status" AS ENUM('pending', 'partially_paid', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."charge_timing" AS ENUM('in_advance', 'in_arrears');--> statement-breakpoint
CREATE TYPE "public"."charge_type" AS ENUM('rent', 'late_interest', 'recurring', 'one_off', 'fee', 'adjustment', 'bank_commission');--> statement-breakpoint
CREATE TABLE "charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"type" charge_type NOT NULL,
	"period_month" date NOT NULL,
	"service_month" date,
	"installment_number" integer,
	"title" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" char(3) NOT NULL,
	"debtor" charge_party NOT NULL,
	"creditor" charge_party NOT NULL,
	"applies_fee" boolean DEFAULT false NOT NULL,
	"status" charge_status DEFAULT 'pending' NOT NULL,
	"is_confirmed" boolean DEFAULT true NOT NULL,
	"due_date" date NOT NULL,
	"recurring_charge_id" uuid,
	"rent_period_id" uuid,
	"calc_explanation" text,
	"notes" text,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "charges_amount_nonzero" CHECK ("charges"."amount" <> 0),
	CONSTRAINT "charges_rent_positive" CHECK ("charges"."type" <> 'rent' or "charges"."amount" > 0),
	CONSTRAINT "charges_month_first_day" CHECK ("charges"."period_month" = date_trunc('month', "charges"."period_month")::date),
	CONSTRAINT "charges_parties" CHECK ("charges"."debtor" in ('tenant', 'owner') and "charges"."debtor" <> "charges"."creditor"),
	CONSTRAINT "charges_void" CHECK (("charges"."status" = 'void') = ("charges"."voided_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "charges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recurring_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"title" text NOT NULL,
	"currency" char(3) NOT NULL,
	"debtor" charge_party DEFAULT 'tenant' NOT NULL,
	"creditor" charge_party DEFAULT 'administration' NOT NULL,
	"applies_fee" boolean DEFAULT false NOT NULL,
	"start_month" date NOT NULL,
	"end_month" date,
	"frequency_months" integer DEFAULT 1 NOT NULL,
	"timing" charge_timing DEFAULT 'in_advance' NOT NULL,
	"last_amount" numeric(14, 2),
	"requires_confirmation" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_charges_frequency" CHECK ("recurring_charges"."frequency_months" between 1 and 24),
	CONSTRAINT "recurring_charges_months" CHECK ("recurring_charges"."end_month" is null or "recurring_charges"."end_month" >= "recurring_charges"."start_month"),
	CONSTRAINT "recurring_charges_parties" CHECK ("recurring_charges"."debtor" in ('tenant', 'owner') and "recurring_charges"."debtor" <> "recurring_charges"."creditor"),
	CONSTRAINT "recurring_charges_title" CHECK (length(trim("recurring_charges"."title")) > 0)
);
--> statement-breakpoint
ALTER TABLE "recurring_charges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_recurring_charge_id_recurring_charges_id_fk" FOREIGN KEY ("recurring_charge_id") REFERENCES "public"."recurring_charges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_rent_period_id_rent_periods_id_fk" FOREIGN KEY ("rent_period_id") REFERENCES "public"."rent_periods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_charges" ADD CONSTRAINT "recurring_charges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_charges" ADD CONSTRAINT "recurring_charges_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_charges" ADD CONSTRAINT "recurring_charges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "charges_contract_month_idx" ON "charges" USING btree ("contract_id","period_month");--> statement-breakpoint
CREATE INDEX "charges_organization_status_idx" ON "charges" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "charges_rent_once_per_month" ON "charges" USING btree ("contract_id","period_month") WHERE "charges"."type" = 'rent' and "charges"."status" <> 'void';--> statement-breakpoint
CREATE UNIQUE INDEX "charges_recurring_once_per_month" ON "charges" USING btree ("recurring_charge_id","period_month") WHERE "charges"."recurring_charge_id" is not null and "charges"."status" <> 'void';--> statement-breakpoint
CREATE INDEX "recurring_charges_contract_idx" ON "recurring_charges" USING btree ("contract_id");