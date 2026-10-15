import { sql } from 'drizzle-orm';
import {
  char,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { authUsers } from 'drizzle-orm/supabase';
import { id, timestamps } from './_shared';
import { plans } from './plans';

// Row Level Security policies for these tables are in supabase/migrations
// (custom "rls_organizations" migration), not here.

export const membershipRole = pgEnum('membership_role', ['admin', 'operator']);

export const subscriptionStatus = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'read_only',
  'cancelled',
]);

export const profiles = pgTable('profiles', {
  id: uuid()
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  firstName: text().notNull().default(''),
  lastName: text().notNull().default(''),
  phone: text(),
  ...timestamps,
}).enableRLS();

export const organizations = pgTable(
  'organizations',
  {
    id: id(),
    name: text().notNull(),
    legalName: text(),
    taxId: text(),
    /** Country pack tax condition code (e.g. RESPONSABLE_INSCRIPTO). */
    taxCondition: text(),
    /** Printed on documents, one line. */
    address: text(),
    countryCode: char({ length: 2 }).notNull(),
    defaultCurrency: char({ length: 3 }).notNull(),
    timezone: text().notNull(),
    locale: text().notNull(),
    email: text(),
    phone: text(),
    logoPath: text(),
    signaturePath: text(),
    settings: jsonb().notNull().default({}),
    subscriptionStatus: subscriptionStatus().notNull().default('trialing'),
    /** Plan being paid (null during the trial, or for pilots with free access). */
    planId: uuid().references(() => plans.id, { onDelete: 'restrict' }),
    /** Extra blocks of contracts on top of the plan (biggest plan only). */
    extraContractBlocks: integer().notNull().default(0),
    trialEndsAt: timestamp({ withTimezone: true }),
    onboardingCompletedAt: timestamp({ withTimezone: true }),
    createdBy: uuid().references(() => authUsers.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    check('organizations_name_not_blank', sql`length(trim(${t.name})) > 0`),
    check('organizations_country_code_upper', sql`${t.countryCode} ~ '^[A-Z]{2}$'`),
    check('organizations_currency_upper', sql`${t.defaultCurrency} ~ '^[A-Z]{3}$'`),
    // One trial per tax id (anti-abuse, docs/01-vision-y-producto.md).
    uniqueIndex('organizations_country_tax_id_key')
      .on(t.countryCode, t.taxId)
      .where(sql`${t.taxId} is not null`),
  ],
).enableRLS();

export const memberships = pgTable(
  'memberships',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    role: membershipRole().notNull(),
    invitedBy: uuid().references(() => authUsers.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('memberships_organization_user_key').on(t.organizationId, t.userId),
    index('memberships_user_idx').on(t.userId),
  ],
).enableRLS();

export const invitations = pgTable(
  'invitations',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text().notNull(),
    role: membershipRole().notNull(),
    // SHA-256 of the token sent in the link; the token itself is never stored.
    tokenHash: text().notNull().unique(),
    invitedBy: uuid().references(() => authUsers.id, { onDelete: 'set null' }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    acceptedBy: uuid().references(() => authUsers.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('invitations_organization_idx').on(t.organizationId),
    check('invitations_email_lower', sql`${t.email} = lower(${t.email})`),
  ],
).enableRLS();
