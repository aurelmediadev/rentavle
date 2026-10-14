CREATE TYPE "public"."bank_account_owner" AS ENUM('client', 'organization');--> statement-breakpoint
CREATE TYPE "public"."client_kind" AS ENUM('person', 'company');--> statement-breakpoint
CREATE TYPE "public"."contact_type" AS ENUM('email', 'phone');--> statement-breakpoint
CREATE TYPE "public"."property_status" AS ENUM('available', 'rented', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('apartment', 'house', 'commercial', 'office', 'parking', 'land', 'other');--> statement-breakpoint
CREATE TABLE "org_counters" (
	"organization_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "org_counters_organization_id_entity_pk" PRIMARY KEY("organization_id","entity")
);
--> statement-breakpoint
ALTER TABLE "org_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_type" "bank_account_owner" NOT NULL,
	"client_id" uuid,
	"bank_name" text,
	"holder_name" text,
	"account_number" text,
	"cbu" text,
	"alias" text,
	"holder_tax_id" text,
	"currency" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_accounts_owner_matches" CHECK (("bank_accounts"."owner_type" = 'client') = ("bank_accounts"."client_id" is not null)),
	CONSTRAINT "bank_accounts_has_identifier" CHECK (coalesce("bank_accounts"."cbu", "bank_accounts"."alias", "bank_accounts"."account_number") is not null)
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"type" "contact_type" NOT NULL,
	"value" text NOT NULL,
	"label" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_contacts_value_not_blank" CHECK (length(trim("client_contacts"."value")) > 0)
);
--> statement-breakpoint
ALTER TABLE "client_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"kind" "client_kind" DEFAULT 'person' NOT NULL,
	"first_name" text,
	"last_name" text,
	"company_name" text,
	"doc_type" text,
	"doc_number" text,
	"tax_id" text,
	"tax_condition" text,
	"nationality" text,
	"birth_date" date,
	"notes" text,
	"street" text,
	"street_number" text,
	"unit" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"address_country" char(2),
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_name_by_kind" CHECK (("clients"."kind" = 'person' and coalesce(trim("clients"."first_name"), '') <> '' and coalesce(trim("clients"."last_name"), '') <> '')
          or ("clients"."kind" = 'company' and coalesce(trim("clients"."company_name"), '') <> ''))
);
--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"type" "property_type" DEFAULT 'apartment' NOT NULL,
	"status" "property_status" DEFAULT 'available' NOT NULL,
	"cadastral_id" text,
	"notes" text,
	"street" text,
	"street_number" text,
	"unit" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"address_country" char(2),
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_street_required" CHECK (coalesce(trim("properties"."street"), '') <> '')
);
--> statement-breakpoint
ALTER TABLE "properties" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "property_owners" (
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"ownership_pct" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_owners_property_id_client_id_pk" PRIMARY KEY("property_id","client_id"),
	CONSTRAINT "property_owners_pct_range" CHECK ("property_owners"."ownership_pct" > 0 and "property_owners"."ownership_pct" <= 100)
);
--> statement-breakpoint
ALTER TABLE "property_owners" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_counters" ADD CONSTRAINT "org_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_owners" ADD CONSTRAINT "property_owners_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_owners" ADD CONSTRAINT "property_owners_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_owners" ADD CONSTRAINT "property_owners_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_accounts_client_idx" ON "bank_accounts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_contacts_client_idx" ON "client_contacts" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_organization_number_key" ON "clients" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "clients_organization_doc_idx" ON "clients" USING btree ("organization_id","doc_number");--> statement-breakpoint
CREATE UNIQUE INDEX "properties_organization_number_key" ON "properties" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "property_owners_client_idx" ON "property_owners" USING btree ("client_id");