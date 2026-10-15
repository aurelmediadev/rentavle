import { check, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createdBy, id, orgNumber } from './_shared';
import { movements } from './movements';
import { organizations } from './organizations';

// RLS, numbering per type and voiding: "rls_documents" migration.

export const documentType = pgEnum('document_type', ['receipt', 'settlement']);
export const documentStatus = pgEnum('document_status', ['issued', 'void']);

/**
 * Issued documents (receipts, settlements). `data` freezes what the PDF prints
 * when it is issued, so it never changes; annulling the movement voids it.
 */
export const documents = pgTable(
  'documents',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    type: documentType().notNull(),
    /** Correlative per organization and type, without gaps. */
    number: orgNumber(),
    movementId: uuid()
      .notNull()
      .references(() => movements.id, { onDelete: 'cascade' }),
    data: jsonb().notNull(),
    status: documentStatus().notNull().default('issued'),
    issuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    voidedAt: timestamp({ withTimezone: true }),
    createdBy: createdBy(),
  },
  (t) => [
    uniqueIndex('documents_organization_type_number_key').on(t.organizationId, t.type, t.number),
    uniqueIndex('documents_movement_key').on(t.movementId),
    check('documents_void', sql`(${t.status} = 'void') = (${t.voidedAt} is not null)`),
  ],
).enableRLS();

/** Public links to share a document; only the token's hash is stored. */
export const documentLinks = pgTable(
  'document_links',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    documentId: uuid()
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdBy: createdBy(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('document_links_token_hash_key').on(t.tokenHash),
    index('document_links_document_idx').on(t.documentId),
  ],
).enableRLS();
