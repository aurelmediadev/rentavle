import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdBy, id, orgNumber, timestamps } from './_shared';
import { clients } from './clients';
import { indexSeries } from './indexes';
import { organizations } from './organizations';
import { properties } from './properties';

// RLS policies, numbering and the overlap guard: "rls_contracts" migration.

export const contractStatus = pgEnum('contract_status', ['active', 'finished', 'renewed']);
export const updateMode = pgEnum('update_mode', ['none', 'index', 'fixed_pct']);
export const feeType = pgEnum('fee_type', ['pct', 'fixed']);
export const lateInterestFrom = pgEnum('late_interest_from', ['after_due', 'day_1']);
export const collectionMethod = pgEnum('collection_method', [
  'cash',
  'transfer_to_admin',
  'transfer_to_owner',
  'split_transfer',
]);
export const contractCreationSource = pgEnum('contract_creation_source', ['web', 'csv', 'ai']);
export const contractPartyRole = pgEnum('contract_party_role', ['owner', 'tenant', 'guarantor']);
export const rentPeriodStatus = pgEnum('rent_period_status', [
  'not_billed',
  'initial',
  'pending',
  'pending_index',
  'calculated',
  'provisional',
  'manually_adjusted',
]);
export const contractEventType = pgEnum('contract_event_type', [
  'created',
  'updated',
  'extended',
  'early_termination',
  'termination_cancelled',
  'renewed',
  'finished',
  'reopened',
]);

export const contracts = pgTable(
  'contracts',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    number: orgNumber(),
    propertyId: uuid()
      .notNull()
      .references(() => properties.id, { onDelete: 'restrict' }),
    status: contractStatus().notNull().default('active'),
    startDate: date().notNull(),
    /** Effective end (moves with extensions and early terminations). */
    endDate: date().notNull(),
    /** Agreed end (moves with extensions, not with early terminations). */
    originalEndDate: date().notNull(),
    currency: char({ length: 3 }).notNull(),
    /** Amount of the period that contains `firstBilledMonth`. */
    initialAmount: numeric({ precision: 14, scale: 2 }).notNull(),
    /** First month that generates debts; earlier installments count as paid. */
    firstBilledMonth: date().notNull(),
    updateMode: updateMode().notNull().default('none'),
    indexSeriesId: uuid().references(() => indexSeries.id, { onDelete: 'restrict' }),
    fixedUpdatePct: numeric({ precision: 7, scale: 4 }),
    updateFrequencyMonths: integer(),
    feeType: feeType().notNull().default('pct'),
    feeValue: numeric({ precision: 14, scale: 4 }).notNull().default('0'),
    feesOnLateInterest: boolean().notNull().default(false),
    lateInterestDailyPct: numeric({ precision: 7, scale: 4 }).notNull().default('0'),
    dueDay: integer().notNull().default(10),
    lateInterestFrom: lateInterestFrom().notNull().default('after_due'),
    collectionMethod: collectionMethod().notNull().default('cash'),
    notes: text(),
    renewedFromContractId: uuid(),
    finishedAt: timestamp({ withTimezone: true }),
    creationSource: contractCreationSource().notNull().default('web'),
    createdBy: createdBy(),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('contracts_organization_number_key').on(t.organizationId, t.number),
    index('contracts_property_idx').on(t.propertyId),
    check('contracts_dates', sql`${t.endDate} > ${t.startDate}`),
    check('contracts_amount_positive', sql`${t.initialAmount} > 0`),
    check('contracts_due_day', sql`${t.dueDay} between 1 and 28`),
    check('contracts_currency_upper', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check(
      'contracts_update_config',
      sql`(${t.updateMode} = 'none' and ${t.indexSeriesId} is null and ${t.fixedUpdatePct} is null)
          or (${t.updateMode} = 'index' and ${t.indexSeriesId} is not null and ${t.updateFrequencyMonths} > 0)
          or (${t.updateMode} = 'fixed_pct' and ${t.fixedUpdatePct} is not null and ${t.updateFrequencyMonths} > 0)`,
    ),
    check('contracts_fee_value', sql`${t.feeValue} >= 0 and (${t.feeType} = 'fixed' or ${t.feeValue} <= 100)`),
    check('contracts_late_interest', sql`${t.lateInterestDailyPct} >= 0 and ${t.lateInterestDailyPct} <= 5`),
    check(
      'contracts_first_billed_month',
      sql`${t.firstBilledMonth} = date_trunc('month', ${t.firstBilledMonth})::date
          and ${t.firstBilledMonth} >= date_trunc('month', ${t.startDate})::date
          and ${t.firstBilledMonth} <= ${t.endDate}`,
    ),
  ],
).enableRLS();

export const contractParties = pgTable(
  'contract_parties',
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contractId: uuid()
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    clientId: uuid()
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    role: contractPartyRole().notNull(),
    /** Owners only: share of the rent (copied from the property). */
    sharePct: numeric({ precision: 5, scale: 2 }),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.contractId, t.clientId, t.role] }),
    index('contract_parties_client_idx').on(t.clientId),
    check(
      'contract_parties_share',
      sql`(${t.role} = 'owner' and ${t.sharePct} > 0 and ${t.sharePct} <= 100) or (${t.role} <> 'owner' and ${t.sharePct} is null)`,
    ),
  ],
).enableRLS();

export const rentPeriods = pgTable(
  'rent_periods',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contractId: uuid()
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    periodNumber: integer().notNull(),
    startMonth: date().notNull(),
    endMonth: date().notNull(),
    status: rentPeriodStatus().notNull(),
    previousAmount: numeric({ precision: 14, scale: 2 }),
    amount: numeric({ precision: 14, scale: 2 }),
    indexStartDate: date(),
    indexStartValue: numeric({ precision: 20, scale: 6 }),
    indexEndDate: date(),
    indexEndValue: numeric({ precision: 20, scale: 6 }),
    variationPct: numeric({ precision: 9, scale: 4 }),
    calculatedAt: timestamp({ withTimezone: true }),
    notes: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('rent_periods_contract_number_key').on(t.contractId, t.periodNumber),
    check('rent_periods_months', sql`${t.endMonth} >= ${t.startMonth}`),
    check(
      'rent_periods_amount_by_status',
      sql`(${t.status} in ('not_billed', 'pending', 'pending_index')) = (${t.amount} is null)`,
    ),
  ],
).enableRLS();

export const contractEvents = pgTable(
  'contract_events',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contractId: uuid()
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    type: contractEventType().notNull(),
    reason: text(),
    payload: jsonb().notNull().default({}),
    createdBy: createdBy(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('contract_events_contract_idx').on(t.contractId, t.createdAt)],
).enableRLS();
