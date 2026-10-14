import { char, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { authUsers } from 'drizzle-orm/supabase';

export const id = () => uuid().primaryKey().defaultRandom();

export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Who created the row (kept if the user is later deleted). */
export const createdBy = () => uuid().references(() => authUsers.id, { onDelete: 'set null' });

/**
 * Number shown to users ("Cliente #12"), correlative per organization. Assigned
 * by a database trigger (private.assign_number), never by the app.
 */
export const orgNumber = () => integer().notNull().default(0);

/** Postal address embedded in the owning row. `region` is a CountryPack region code. */
export const address = {
  street: text(),
  streetNumber: text(),
  unit: text(),
  city: text(),
  region: text(),
  postalCode: text(),
  addressCountry: char({ length: 2 }),
};
