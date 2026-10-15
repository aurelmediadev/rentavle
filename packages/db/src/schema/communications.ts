import { sql } from 'drizzle-orm';
import { check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdBy, id, timestamps } from './_shared';
import { clients } from './clients';
import { contracts } from './contracts';
import { movements } from './movements';
import { organizations } from './organizations';

// RLS and the columns users may update: "rls_communications" migration.

export const communicationType = pgEnum('communication_type', [
  'receipt',
  'settlement',
  'payment_reminder',
  'late_notice',
  'amount_update',
  'contract_expiry',
]);
export const communicationChannel = pgEnum('communication_channel', ['email', 'whatsapp_link']);
export const communicationSender = pgEnum('communication_sender', ['manual', 'automatic']);
export const communicationStatus = pgEnum('communication_status', ['queued', 'sent', 'delivered', 'bounced', 'failed']);
export const templateChannel = pgEnum('template_channel', ['email', 'whatsapp']);

/** Every message sent (or opened in WhatsApp) to a client or the agency. */
export const communications = pgTable(
  'communications',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contractId: uuid().references(() => contracts.id, { onDelete: 'set null' }),
    clientId: uuid().references(() => clients.id, { onDelete: 'set null' }),
    movementId: uuid().references(() => movements.id, { onDelete: 'set null' }),
    type: communicationType().notNull(),
    channel: communicationChannel().notNull(),
    sender: communicationSender().notNull(),
    toAddress: text().notNull(),
    subject: text(),
    body: text().notNull(),
    status: communicationStatus().notNull().default('queued'),
    providerMessageId: text(),
    error: text(),
    attempts: integer().notNull().default(0),
    /** Automatic notices: the same notice is never recorded (nor sent) twice. */
    dedupeKey: text(),
    sentAt: timestamp({ withTimezone: true }),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('communications_dedupe_key').on(t.organizationId, t.dedupeKey),
    index('communications_contract_idx').on(t.contractId, t.createdAt),
    index('communications_client_idx').on(t.clientId, t.createdAt),
    index('communications_movement_idx').on(t.movementId),
    index('communications_provider_idx').on(t.providerMessageId),
    check('communications_automatic_dedupe', sql`${t.sender} = 'manual' or ${t.dedupeKey} is not null`),
  ],
).enableRLS();

/** An agency's own version of a message (the defaults live in @rentavle/emails). */
export const messageTemplates = pgTable(
  'message_templates',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    type: communicationType().notNull(),
    channel: templateChannel().notNull(),
    subject: text(),
    body: text().notNull(),
    updatedBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('message_templates_key').on(t.organizationId, t.type, t.channel),
    check('message_templates_body', sql`length(trim(${t.body})) > 0`),
  ],
).enableRLS();
