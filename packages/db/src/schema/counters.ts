import { integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

/**
 * Last number used per organization and entity ("client", "property"...).
 * Only written by private.assign_number(); users have no access.
 */
export const orgCounters = pgTable(
  'org_counters',
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    entity: text().notNull(),
    lastNumber: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.entity] })],
).enableRLS();
