import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdBy, id, orgNumber, timestamps } from './_shared';
import { charges } from './charges';
import { bankAccounts, clients } from './clients';
import { contracts } from './contracts';
import { organizations } from './organizations';

// RLS, numbering and charge-status maintenance: "rls_movements" migration.

export const cashAccountType = pgEnum('cash_account_type', ['cash', 'bank']);
export const movementType = pgEnum('movement_type', [
  'tenant_payment',
  'owner_settlement',
  'manual_income',
  'manual_expense',
  'transfer',
]);
export const paymentMethod = pgEnum('payment_method', [
  'cash',
  'transfer_to_admin',
  'transfer_to_owner',
  'split_transfer',
  'online',
  /** Settlements: the agency transfers the owner's money. */
  'transfer_from_admin',
]);

/** Where the agency's money is: physical cash boxes and bank accounts. */
export const cashAccounts = pgTable(
  'cash_accounts',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    type: cashAccountType().notNull(),
    name: text().notNull(),
    currency: char({ length: 3 }).notNull(),
    bankAccountId: uuid().references(() => bankAccounts.id, { onDelete: 'set null' }),
    isDefault: boolean().notNull().default(false),
    archivedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('cash_accounts_organization_idx').on(t.organizationId),
    check('cash_accounts_name', sql`length(trim(${t.name})) > 0`),
  ],
).enableRLS();

/** Every money operation a user records (collections, settlements, manual entries). */
export const movements = pgTable(
  'movements',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    number: orgNumber(),
    type: movementType().notNull(),
    date: date().notNull(),
    contractId: uuid().references(() => contracts.id, { onDelete: 'restrict' }),
    clientId: uuid().references(() => clients.id, { onDelete: 'restrict' }),
    method: paymentMethod().notNull(),
    /** Box/account the money entered or left; null when it never passed through the agency. */
    cashAccountId: uuid().references(() => cashAccounts.id, { onDelete: 'restrict' }),
    /** Transfers between boxes: the box/account that receives the money. */
    toCashAccountId: uuid().references(() => cashAccounts.id, { onDelete: 'restrict' }),
    /** Split transfers: part the tenant paid straight to the owners (the rest entered cashAccountId). */
    ownerDirectAmount: numeric({ precision: 14, scale: 2 }),
    /** Money actually received or paid (can exceed the debts: the rest is saldo a favor). */
    amount: numeric({ precision: 14, scale: 2 }).notNull(),
    currency: char({ length: 3 }).notNull(),
    notes: text(),
    /** Set when the movement is annulled; its allocations stop counting. */
    reversedAt: timestamp({ withTimezone: true }),
    reversedBy: uuid(),
    reverseReason: text(),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('movements_organization_number_key').on(t.organizationId, t.number),
    index('movements_contract_idx').on(t.contractId),
    index('movements_organization_date_idx').on(t.organizationId, t.date),
    check('movements_amount', sql`${t.amount} >= 0`),
    check('movements_reversal', sql`(${t.reversedAt} is null) = (${t.reverseReason} is null)`),
  ],
).enableRLS();

/** Which part of a movement pays which debt. Immutable; a reversal annuls the movement. */
export const chargeAllocations = pgTable(
  'charge_allocations',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    movementId: uuid()
      .notNull()
      .references(() => movements.id, { onDelete: 'cascade' }),
    chargeId: uuid()
      .notNull()
      .references(() => charges.id, { onDelete: 'restrict' }),
    amount: numeric({ precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('charge_allocations_movement_charge_key').on(t.movementId, t.chargeId),
    index('charge_allocations_charge_idx').on(t.chargeId),
    check('charge_allocations_nonzero', sql`${t.amount} <> 0`),
  ],
).enableRLS();


/**
 * What an owner settlement paid: one line per tenant allocation and owner
 * (co-owners get one line each). A tenant allocation is settled at most once per
 * owner while the settlement isn't annulled (checked by trigger).
 */
export const settlementLines = pgTable(
  'settlement_lines',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    settlementId: uuid()
      .notNull()
      .references(() => movements.id, { onDelete: 'cascade' }),
    allocationId: uuid()
      .notNull()
      .references(() => chargeAllocations.id, { onDelete: 'restrict' }),
    clientId: uuid()
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    sharePct: numeric({ precision: 5, scale: 2 }).notNull(),
    gross: numeric({ precision: 14, scale: 2 }).notNull(),
    fee: numeric({ precision: 14, scale: 2 }).notNull(),
    payout: numeric({ precision: 14, scale: 2 }).notNull(),
    feeOwed: numeric({ precision: 14, scale: 2 }).notNull().default('0'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('settlement_lines_settlement_idx').on(t.settlementId),
    index('settlement_lines_allocation_idx').on(t.allocationId, t.clientId),
    check('settlement_lines_amounts', sql`${t.fee} >= 0 and ${t.payout} >= 0 and ${t.feeOwed} >= 0`),
  ],
).enableRLS();
