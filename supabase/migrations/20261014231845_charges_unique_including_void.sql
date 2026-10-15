DROP INDEX "charges_rent_once_per_month";--> statement-breakpoint
DROP INDEX "charges_recurring_once_per_month";--> statement-breakpoint
CREATE UNIQUE INDEX "charges_rent_once_per_month" ON "charges" USING btree ("contract_id","period_month") WHERE "charges"."type" = 'rent';--> statement-breakpoint
CREATE UNIQUE INDEX "charges_recurring_once_per_month" ON "charges" USING btree ("recurring_charge_id","period_month") WHERE "charges"."recurring_charge_id" is not null;