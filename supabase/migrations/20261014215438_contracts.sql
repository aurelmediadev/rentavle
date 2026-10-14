CREATE TYPE "public"."index_frequency" AS ENUM('daily', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."collection_method" AS ENUM('cash', 'transfer_to_admin', 'transfer_to_owner', 'split_transfer');--> statement-breakpoint
CREATE TYPE "public"."contract_creation_source" AS ENUM('web', 'csv', 'ai');--> statement-breakpoint
CREATE TYPE "public"."contract_event_type" AS ENUM('created', 'updated', 'extended', 'early_termination', 'termination_cancelled', 'renewed', 'finished', 'reopened');--> statement-breakpoint
CREATE TYPE "public"."contract_party_role" AS ENUM('owner', 'tenant', 'guarantor');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('active', 'finished', 'renewed');--> statement-breakpoint
CREATE TYPE "public"."fee_type" AS ENUM('pct', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."late_interest_from" AS ENUM('after_due', 'day_1');--> statement-breakpoint
CREATE TYPE "public"."rent_period_status" AS ENUM('not_billed', 'initial', 'pending', 'pending_index', 'calculated', 'provisional', 'manually_adjusted');--> statement-breakpoint
CREATE TYPE "public"."update_mode" AS ENUM('none', 'index', 'fixed_pct');--> statement-breakpoint
CREATE TABLE "index_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"country_code" char(2) NOT NULL,
	"name" text NOT NULL,
	"frequency" "index_frequency" NOT NULL,
	"publisher" text NOT NULL,
	"source_url" text,
	CONSTRAINT "index_series_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "index_series" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "index_values" (
	"series_id" uuid NOT NULL,
	"date" date NOT NULL,
	"value" numeric(20, 6) NOT NULL,
	"is_provisional" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "index_values_series_id_date_pk" PRIMARY KEY("series_id","date")
);
--> statement-breakpoint
ALTER TABLE "index_values" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contract_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"type" "contract_event_type" NOT NULL,
	"reason" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contract_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contract_parties" (
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"role" "contract_party_role" NOT NULL,
	"share_pct" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_parties_contract_id_client_id_role_pk" PRIMARY KEY("contract_id","client_id","role"),
	CONSTRAINT "contract_parties_share" CHECK (("contract_parties"."role" = 'owner' and "contract_parties"."share_pct" > 0 and "contract_parties"."share_pct" <= 100) or ("contract_parties"."role" <> 'owner' and "contract_parties"."share_pct" is null))
);
--> statement-breakpoint
ALTER TABLE "contract_parties" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" integer DEFAULT 0 NOT NULL,
	"property_id" uuid NOT NULL,
	"status" "contract_status" DEFAULT 'active' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"original_end_date" date NOT NULL,
	"currency" char(3) NOT NULL,
	"initial_amount" numeric(14, 2) NOT NULL,
	"first_billed_month" date NOT NULL,
	"update_mode" "update_mode" DEFAULT 'none' NOT NULL,
	"index_series_id" uuid,
	"fixed_update_pct" numeric(7, 4),
	"update_frequency_months" integer,
	"fee_type" "fee_type" DEFAULT 'pct' NOT NULL,
	"fee_value" numeric(14, 4) DEFAULT '0' NOT NULL,
	"fees_on_late_interest" boolean DEFAULT false NOT NULL,
	"late_interest_daily_pct" numeric(7, 4) DEFAULT '0' NOT NULL,
	"due_day" integer DEFAULT 10 NOT NULL,
	"late_interest_from" "late_interest_from" DEFAULT 'after_due' NOT NULL,
	"collection_method" "collection_method" DEFAULT 'cash' NOT NULL,
	"file_path" text,
	"notes" text,
	"renewed_from_contract_id" uuid,
	"finished_at" timestamp with time zone,
	"creation_source" "contract_creation_source" DEFAULT 'web' NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_dates" CHECK ("contracts"."end_date" > "contracts"."start_date"),
	CONSTRAINT "contracts_amount_positive" CHECK ("contracts"."initial_amount" > 0),
	CONSTRAINT "contracts_due_day" CHECK ("contracts"."due_day" between 1 and 28),
	CONSTRAINT "contracts_currency_upper" CHECK ("contracts"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "contracts_update_config" CHECK (("contracts"."update_mode" = 'none' and "contracts"."index_series_id" is null and "contracts"."fixed_update_pct" is null)
          or ("contracts"."update_mode" = 'index' and "contracts"."index_series_id" is not null and "contracts"."update_frequency_months" > 0)
          or ("contracts"."update_mode" = 'fixed_pct' and "contracts"."fixed_update_pct" is not null and "contracts"."update_frequency_months" > 0)),
	CONSTRAINT "contracts_fee_value" CHECK ("contracts"."fee_value" >= 0 and ("contracts"."fee_type" = 'fixed' or "contracts"."fee_value" <= 100)),
	CONSTRAINT "contracts_late_interest" CHECK ("contracts"."late_interest_daily_pct" >= 0 and "contracts"."late_interest_daily_pct" <= 5),
	CONSTRAINT "contracts_first_billed_month" CHECK ("contracts"."first_billed_month" = date_trunc('month', "contracts"."first_billed_month")::date
          and "contracts"."first_billed_month" >= date_trunc('month', "contracts"."start_date")::date
          and "contracts"."first_billed_month" <= "contracts"."end_date")
);
--> statement-breakpoint
ALTER TABLE "contracts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rent_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"period_number" integer NOT NULL,
	"start_month" date NOT NULL,
	"end_month" date NOT NULL,
	"status" "rent_period_status" NOT NULL,
	"previous_amount" numeric(14, 2),
	"amount" numeric(14, 2),
	"index_start_date" date,
	"index_start_value" numeric(20, 6),
	"index_end_date" date,
	"index_end_value" numeric(20, 6),
	"variation_pct" numeric(9, 4),
	"calculated_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rent_periods_months" CHECK ("rent_periods"."end_month" >= "rent_periods"."start_month"),
	CONSTRAINT "rent_periods_amount_by_status" CHECK (("rent_periods"."status" in ('not_billed', 'pending', 'pending_index')) = ("rent_periods"."amount" is null))
);
--> statement-breakpoint
ALTER TABLE "rent_periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "index_values" ADD CONSTRAINT "index_values_series_id_index_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."index_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_index_series_id_index_series_id_fk" FOREIGN KEY ("index_series_id") REFERENCES "public"."index_series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_periods" ADD CONSTRAINT "rent_periods_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_periods" ADD CONSTRAINT "rent_periods_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_events_contract_idx" ON "contract_events" USING btree ("contract_id","created_at");--> statement-breakpoint
CREATE INDEX "contract_parties_client_idx" ON "contract_parties" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_organization_number_key" ON "contracts" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "contracts_property_idx" ON "contracts" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rent_periods_contract_number_key" ON "rent_periods" USING btree ("contract_id","period_number");