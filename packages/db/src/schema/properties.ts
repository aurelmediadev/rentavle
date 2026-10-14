import { sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { address, createdBy, id, orgNumber, timestamps } from './_shared';
import { clients } from './clients';
import { organizations } from './organizations';

// RLS policies: supabase/migrations (custom "rls_clients_properties" migration).

export const propertyType = pgEnum('property_type', [
  'apartment',
  'house',
  'commercial',
  'office',
  'parking',
  'land',
  'other',
]);

export const propertyStatus = pgEnum('property_status', ['available', 'rented', 'unavailable']);

export const properties = pgTable(
  'properties',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    number: orgNumber(),
    type: propertyType().notNull().default('apartment'),
    status: propertyStatus().notNull().default('available'),
    cadastralId: text(),
    notes: text(),
    ...address,
    createdBy: createdBy(),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('properties_organization_number_key').on(t.organizationId, t.number),
    check('properties_street_required', sql`coalesce(trim(${t.street}), '') <> ''`),
  ],
).enableRLS();

/** Owners of a property. Percentages add up to 100 (checked by a deferred trigger). */
export const propertyOwners = pgTable(
  'property_owners',
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    propertyId: uuid()
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    clientId: uuid()
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    ownershipPct: numeric({ precision: 5, scale: 2 }).notNull(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.propertyId, t.clientId] }),
    index('property_owners_client_idx').on(t.clientId),
    check('property_owners_pct_range', sql`${t.ownershipPct} > 0 and ${t.ownershipPct} <= 100`),
  ],
).enableRLS();
