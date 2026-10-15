import { boolean, char, integer, numeric, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_shared';

// Read by every signed-in user; written only by migrations and the internal admin panel.
// RLS: "plans" migration.

/** Subscription plans per country, by number of active contracts (docs/01-vision-y-producto.md). */
export const plans = pgTable(
  'plans',
  {
    id: id(),
    code: text().notNull(),
    countryCode: char({ length: 2 }).notNull(),
    name: text().notNull(),
    maxActiveContracts: integer().notNull(),
    monthlyPrice: numeric({ precision: 14, scale: 2 }).notNull(),
    /** Yearly payment (10 months: two free). */
    annualPrice: numeric({ precision: 14, scale: 2 }).notNull(),
    currency: char({ length: 3 }).notNull(),
    /** Extra contracts sold in blocks on the biggest plan (e.g. +100). */
    extraBlockContracts: integer(),
    extraBlockPrice: numeric({ precision: 14, scale: 2 }),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('plans_country_code_key').on(t.countryCode, t.code)],
).enableRLS();
