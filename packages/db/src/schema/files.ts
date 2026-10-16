import { sql } from 'drizzle-orm';
import { check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdBy, id } from './_shared';
import { organizations } from './organizations';

// RLS and the private Storage bucket "files": "rls_files" migration.

export const fileEntityType = pgEnum('file_entity_type', ['contract', 'movement', 'client', 'property']);

/**
 * Attachments: the signed contract and its annexes, payment receipts, client or
 * property documents. The bytes live in Storage under
 * "<organization>/<entity type>/<entity id>/<random>-<name>".
 */
export const files = pgTable(
  'files',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    entityType: fileEntityType().notNull(),
    entityId: uuid().notNull(),
    storagePath: text().notNull(),
    filename: text().notNull(),
    mimeType: text().notNull(),
    sizeBytes: integer().notNull(),
    createdBy: createdBy(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('files_storage_path_key').on(t.storagePath),
    index('files_entity_idx').on(t.entityType, t.entityId),
    check('files_size', sql`${t.sizeBytes} > 0 and ${t.sizeBytes} <= 10485760`),
  ],
).enableRLS();
