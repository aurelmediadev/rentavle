import { index, integer, numeric, pgEnum, pgTable, char, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdBy, id, timestamps } from './_shared';
import { organizations } from './organizations';
import { plans } from './plans';

// Admins of the agency read them; only server code (billing webhook, admin
// panel) writes: "rls_subscriptions" migration.

export const billingCycle = pgEnum('billing_cycle', ['monthly', 'annual']);
export const billingProvider = pgEnum('billing_provider', ['mercadopago', 'simulated']);
/** Mirrors MercadoPago's preapproval statuses. */
export const subscriptionProviderStatus = pgEnum('subscription_provider_status', ['pending', 'authorized', 'paused', 'cancelled']);

/** An agency's subscription with a payment provider (automatic debit). */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),
    cycle: billingCycle().notNull(),
    extraBlocks: integer().notNull().default(0),
    amount: numeric({ precision: 14, scale: 2 }).notNull(),
    currency: char({ length: 3 }).notNull(),
    provider: billingProvider().notNull(),
    providerSubscriptionId: text(),
    /** Where the admin authorizes the debit (MercadoPago checkout). */
    checkoutUrl: text(),
    status: subscriptionProviderStatus().notNull().default('pending'),
    payerEmail: text().notNull(),
    nextPaymentDate: timestamp({ withTimezone: true }),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('subscriptions_provider_key').on(t.provider, t.providerSubscriptionId),
    index('subscriptions_organization_idx').on(t.organizationId, t.createdAt),
  ],
).enableRLS();

/** Each charge of a subscription, as reported by the provider. */
export const subscriptionPayments = pgTable(
  'subscription_payments',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    subscriptionId: uuid()
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    providerPaymentId: text().notNull(),
    amount: numeric({ precision: 14, scale: 2 }).notNull(),
    currency: char({ length: 3 }).notNull(),
    /** Provider status: approved, rejected, pending... */
    status: text().notNull(),
    paidAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex('subscription_payments_provider_key').on(t.subscriptionId, t.providerPaymentId)],
).enableRLS();
