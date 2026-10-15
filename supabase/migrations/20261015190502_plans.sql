CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"country_code" char(2) NOT NULL,
	"name" text NOT NULL,
	"max_active_contracts" integer NOT NULL,
	"monthly_price" numeric(14, 2) NOT NULL,
	"annual_price" numeric(14, 2) NOT NULL,
	"currency" char(3) NOT NULL,
	"extra_block_contracts" integer,
	"extra_block_price" numeric(14, 2),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "extra_contract_blocks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "plans_country_code_key" ON "plans" USING btree ("country_code","code");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;