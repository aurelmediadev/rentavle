CREATE TYPE "public"."index_method" AS ENUM('level_ratio', 'coefficient_product');--> statement-breakpoint
ALTER TABLE "index_series" ADD COLUMN "method" "index_method" DEFAULT 'level_ratio' NOT NULL;
--> statement-breakpoint
UPDATE "index_series" SET "method" = 'coefficient_product' WHERE "code" = 'AR_CASA_PROPIA';
