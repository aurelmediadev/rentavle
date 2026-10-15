import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdBy, id, timestamps } from './_shared';
import { clients } from './clients';
import { contracts, rentPeriods } from './contracts';
import { organizations } from './organizations';

// RLS policies: "rls_charges" migration.

export const chargeParty = pgEnum('charge_party', ['tenant', 'owner', 'administration', 'third_party']);
export const chargeType = pgEnum('charge_type', [
  'rent',
  'late_interest',
  'recurring',
  'one_off',
  'fee',
  'adjustment',
  'bank_commission',
  /** Saldo a favor: money the tenant already paid in excess (no ledger entry of its own). */
  'credit_balance',
]);
export const chargeStatus = pgEnum('charge_status', ['pending', 'partially_paid', 'paid', 'void']);
export const chargeTiming = pgEnum('charge_timing', ['in_advance', 'in_arrears']);

/** Templates that generate a charge every N months (expensas, ABL, services...). */
export const recurringCharges = pgTable(
  'recurring_charges',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contractId: uuid()
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    currency: char({ length: 3 }).notNull(),
    debtor: chargeParty().notNull().default('tenant'),
    creditor: chargeParty().notNull().default('administration'),
    appliesFee: boolean().notNull().default(false),
    startMonth: date().notNull(),
    endMonth: date(),
    frequencyMonths: integer().notNull().default(1),
    timing: chargeTiming().notNull().default('in_advance'),
    /** Amount used for the next charge (the last confirmed one). */
    lastAmount: numeric({ precision: 14, scale: 2 }),
    /** Variable amounts (utilities, expensas) start unconfirmed every month. */
    requiresConfirmation: boolean().notNull().default(false),
    notes: text(),
    createdBy: createdBy(),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('recurring_charges_contract_idx').on(t.contractId),
    check('recurring_charges_frequency', sql`${t.frequencyMonths} between 1 and 24`),
    check('recurring_charges_months', sql`${t.endMonth} is null or ${t.endMonth} >= ${t.startMonth}`),
    check('recurring_charges_parties', sql`${t.debtor} in ('tenant', 'owner') and ${t.debtor} <> ${t.creditor}`),
    check('recurring_charges_title', sql`length(trim(${t.title})) > 0`),
  ],
).enableRLS();

/** Each concrete debt. Amounts are signed: a negative one-off is a discount (credit). */
export const charges = pgTable(
  'charges',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contractId: uuid()
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    type: chargeType().notNull(),
    /** Billing month (first day): the month in which the debt is owed. */
    periodMonth: date().notNull(),
    /** Month the charge covers when different (recurring in arrears). */
    serviceMonth: date(),
    installmentNumber: integer(),
    title: text().notNull(),
    amount: numeric({ precision: 14, scale: 2 }).notNull(),
    currency: char({ length: 3 }).notNull(),
    debtor: chargeParty().notNull(),
    creditor: chargeParty().notNull(),
    appliesFee: boolean().notNull().default(false),
    status: chargeStatus().notNull().default('pending'),
    /** False while the amount is an estimate (rent waiting for its index, variable expenses). */
    isConfirmed: boolean().notNull().default(true),
    dueDate: date().notNull(),
    recurringChargeId: uuid().references(() => recurringCharges.id, { onDelete: 'set null' }),
    rentPeriodId: uuid().references(() => rentPeriods.id, { onDelete: 'set null' }),
    /**
     * Movement that created this debt (late interest charged at payment time, or a
     * saldo a favor from an overpayment). Reversing the movement voids it.
     */
    sourceMovementId: uuid(),
    /**
     * Specific owner who owes this debt, for co-owned properties (e.g. fees owed by
     * one owner). Null = all owners of the contract.
     */
    debtorClientId: uuid().references(() => clients.id, { onDelete: 'restrict' }),
    /** Human-readable calculation, shown on screen and receipts. */
    calcExplanation: text(),
    notes: text(),
    voidedAt: timestamp({ withTimezone: true }),
    voidReason: text(),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    index('charges_contract_month_idx').on(t.contractId, t.periodMonth),
    index('charges_organization_status_idx').on(t.organizationId, t.status),
    // Idempotency of the monthly job: one rent debt per contract and month, one
    // debt per recurring template and month. Voided ones count too, so the job
    // never re-creates a debt someone voided on purpose.
    uniqueIndex('charges_rent_once_per_month')
      .on(t.contractId, t.periodMonth)
      .where(sql`${t.type} = 'rent'`),
    uniqueIndex('charges_recurring_once_per_month')
      .on(t.recurringChargeId, t.periodMonth)
      .where(sql`${t.recurringChargeId} is not null`),
    check('charges_amount_nonzero', sql`${t.amount} <> 0`),
    check('charges_rent_positive', sql`${t.type} <> 'rent' or ${t.amount} > 0`),
    check('charges_month_first_day', sql`${t.periodMonth} = date_trunc('month', ${t.periodMonth})::date`),
    check('charges_parties', sql`${t.debtor} in ('tenant', 'owner') and ${t.debtor} <> ${t.creditor}`),
    check('charges_void', sql`(${t.status} = 'void') = (${t.voidedAt} is not null)`),
  ],
).enableRLS();
