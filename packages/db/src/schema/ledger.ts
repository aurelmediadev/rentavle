import { sql } from 'drizzle-orm';
import { char, check, date, index, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { id } from './_shared';
import { charges } from './charges';
import { movements } from './movements';
import { organizations } from './organizations';

// Double-entry ledger (docs/03-reglas-de-negocio.md §9). Entries are written only
// by the database ("ledger" migration): every debt and every movement posts its
// entries at commit, corrections are reversals, and each posting is balanced.

export const ledgerAccountType = pgEnum('ledger_account_type', [
  /** A cash box or bank account of the agency (ref: cash_accounts). */
  'cash',
  /** What the tenant of a contract owes (ref: contracts). */
  'tenant',
  /** What the agency owes the owners of a contract (ref: contracts). */
  'owner',
  /** Agency fees (income). */
  'fees',
  /** Debts in favour of the administration other than fees (expensas, repairs). */
  'admin_charges',
  /** Debts in favour of third parties (ref: contracts). */
  'third_party',
  /** Manual income of the agency. */
  'other_income',
  /** Manual expenses of the agency. */
  'expenses',
]);
export const ledgerDirection = pgEnum('ledger_direction', ['debit', 'credit']);

export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    type: ledgerAccountType().notNull(),
    refId: uuid(),
    currency: char({ length: 3 }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  // Unique (organization, type, ref, currency) with nulls not distinct: "ledger" migration.
  (t) => [index('ledger_accounts_organization_idx').on(t.organizationId)],
).enableRLS();

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Entries posted together; debits equal credits within a posting. */
    postingId: uuid().notNull(),
    movementId: uuid().references(() => movements.id, { onDelete: 'no action' }),
    chargeId: uuid().references(() => charges.id, { onDelete: 'no action' }),
    accountId: uuid()
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: 'no action' }),
    direction: ledgerDirection().notNull(),
    amount: numeric({ precision: 14, scale: 2 }).notNull(),
    currency: char({ length: 3 }).notNull(),
    /** Accounting date: the movement's date, or the day of the correction for reversals. */
    date: date().notNull(),
    concept: text().notNull(),
    reversalOfId: uuid(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ledger_entries_account_date_idx').on(t.accountId, t.date),
    index('ledger_entries_posting_idx').on(t.postingId),
    index('ledger_entries_movement_idx').on(t.movementId),
    index('ledger_entries_charge_idx').on(t.chargeId),
    uniqueIndex('ledger_entries_reversed_once').on(t.reversalOfId),
    check('ledger_entries_amount', sql`${t.amount} > 0`),
    check('ledger_entries_source', sql`(${t.movementId} is null) <> (${t.chargeId} is null)`),
  ],
).enableRLS();
