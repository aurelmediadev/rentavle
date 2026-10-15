import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { type Database, schema } from '@rentavle/db';
import type { BillingProvider, ProviderPayment, ProviderStatus } from './providers';

const { subscriptions, subscriptionPayments, organizations } = schema;

/**
 * Applies a provider status to our subscription and to the organization
 * (server code only: webhook and simulator). Idempotent.
 *
 *   authorized → organization active on that plan; any other subscription of
 *                the agency is cancelled (a plan change replaces the old debit)
 *   paused     → payment problems: past_due (still writable while it retries)
 *   cancelled  → if it was the agency's subscription: back to the trial if it
 *                hasn't ended, otherwise cancelled (read-only)
 */
export async function applySubscriptionStatus(
  db: Database,
  input: { provider: 'mercadopago' | 'simulated'; providerSubscriptionId: string; status: ProviderStatus; nextPaymentDate?: Date | null },
  deps: { provider: BillingProvider; now: Date },
): Promise<{ organizationId: string; organizationStatus: string } | null> {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.provider, input.provider), eq(subscriptions.providerSubscriptionId, input.providerSubscriptionId)));
  if (!sub) return null;

  await db
    .update(subscriptions)
    .set({ status: input.status, nextPaymentDate: input.nextPaymentDate ?? sub.nextPaymentDate, updatedAt: deps.now })
    .where(eq(subscriptions.id, sub.id));
  const [org] = await db.select().from(organizations).where(eq(organizations.id, sub.organizationId));
  if (!org) return null;

  if (input.status === 'authorized') {
    const others = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.organizationId, org.id), ne(subscriptions.id, sub.id), inArray(subscriptions.status, ['pending', 'authorized', 'paused'])));
    for (const other of others) {
      if (other.status !== 'pending' && other.providerSubscriptionId) {
        await deps.provider.cancel(other.providerSubscriptionId).catch(() => undefined);
      }
      await db.update(subscriptions).set({ status: 'cancelled', updatedAt: deps.now }).where(eq(subscriptions.id, other.id));
    }
    await db
      .update(organizations)
      .set({ subscriptionStatus: 'active', planId: sub.planId, extraContractBlocks: sub.extraBlocks })
      .where(eq(organizations.id, org.id));
    return { organizationId: org.id, organizationStatus: 'active' };
  }

  // Paused or cancelled only matter if this is the agency's current subscription.
  const [current] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.organizationId, org.id), inArray(subscriptions.status, ['authorized', 'paused', 'cancelled'])))
    .orderBy(desc(subscriptions.updatedAt), desc(subscriptions.createdAt))
    .limit(1);
  const stillActive = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.organizationId, org.id), eq(subscriptions.status, 'authorized')));
  if (current?.id !== sub.id || stillActive.length > 0) {
    return { organizationId: org.id, organizationStatus: org.subscriptionStatus };
  }

  let status = org.subscriptionStatus;
  if (input.status === 'paused') status = 'past_due';
  if (input.status === 'cancelled') {
    status = org.trialEndsAt && org.trialEndsAt > deps.now && org.subscriptionStatus === 'trialing' ? 'trialing' : 'cancelled';
  }
  await db.update(organizations).set({ subscriptionStatus: status }).where(eq(organizations.id, org.id));
  return { organizationId: org.id, organizationStatus: status };
}

/** Records a charge of a subscription (one row per provider payment). */
export async function recordSubscriptionPayment(db: Database, provider: 'mercadopago' | 'simulated', payment: ProviderPayment) {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.provider, provider), eq(subscriptions.providerSubscriptionId, payment.subscriptionId)));
  if (!sub) return null;
  const values = {
    organizationId: sub.organizationId,
    subscriptionId: sub.id,
    providerPaymentId: payment.id,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    paidAt: payment.status === 'approved' ? (payment.date ?? new Date()) : null,
  };
  await db
    .insert(subscriptionPayments)
    .values(values)
    .onConflictDoUpdate({
      target: [subscriptionPayments.subscriptionId, subscriptionPayments.providerPaymentId],
      set: { status: values.status, paidAt: values.paidAt, updatedAt: new Date() },
    });
  return sub;
}
