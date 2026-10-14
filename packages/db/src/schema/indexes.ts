import { boolean, char, date, numeric, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { id } from './_shared';

// Global reference data (no organization_id): readable by every signed-in user,
// written only by the index import job. Policies in the "rls_contracts" migration.

export const indexFrequency = pgEnum('index_frequency', ['daily', 'monthly']);

export const indexSeries = pgTable('index_series', {
  id: id(),
  /** Stable code used by the app and CountryPacks: AR_IPC, AR_ICL, CL_UF... */
  code: text().notNull().unique(),
  countryCode: char({ length: 2 }).notNull(),
  name: text().notNull(),
  frequency: indexFrequency().notNull(),
  publisher: text().notNull(),
  sourceUrl: text(),
}).enableRLS();

export const indexValues = pgTable(
  'index_values',
  {
    seriesId: uuid()
      .notNull()
      .references(() => indexSeries.id, { onDelete: 'cascade' }),
    /** Day for daily series; first day of the month for monthly ones. */
    date: date().notNull(),
    value: numeric({ precision: 20, scale: 6 }).notNull(),
    isProvisional: boolean().notNull().default(false),
    publishedAt: timestamp({ withTimezone: true }),
    fetchedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.seriesId, t.date] })],
).enableRLS();
