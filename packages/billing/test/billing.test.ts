import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { schema } from '@rentavle/db';
import { createTestDb, type TestUser } from '../../db/test/helpers';
import { type BillingProvider, applySubscriptionStatus, mercadoPagoProvider, recordSubscriptionPayment, verifyMercadoPagoSignature } from '../src';

const { organizations, plans, subscriptions, subscriptionPayments } = schema;
const { db, createUser, createOrganization, cleanup } = createTestDb();

let alice: TestUser;
const now = new Date();

function fakeProvider(): BillingProvider & { cancelled: string[] } {
  const cancelled: string[] = [];
  return {
    name: 'mercadopago',
    cancelled,
    create: async () => ({ id: 'x', checkoutUrl: 'x' }),
    get: async (id) => ({ id, status: 'pending', reference: null, nextPaymentDate: null }),
    getPayment: async () => {
      throw new Error('no');
    },
    cancel: async (id) => void cancelled.push(id),
  };
}

async function subscription(orgId: string, planCode: string, providerId: string) {
  const [plan] = await db.admin.select().from(plans).where(eq(plans.code, planCode));
  const [row] = await db
    .withUser(alice.claims, (tx) =>
      tx
        .insert(subscriptions)
        .values({ organizationId: orgId, planId: plan!.id, cycle: 'monthly', amount: plan!.monthlyPrice, currency: 'ARS', provider: 'mercadopago', providerSubscriptionId: providerId, payerEmail: alice.email, createdBy: alice.id })
        .returning(),
    );
  return { row: row!, plan: plan! };
}

const org = async (id: string) => (await db.admin.select().from(organizations).where(eq(organizations.id, id)))[0]!;

beforeAll(async () => {
  alice = await createUser('alice');
});
afterAll(cleanup);

describe('subscription status', () => {
  it('activates the plan when authorized, and replaces an earlier subscription on a plan change', async () => {
    const orgId = await createOrganization(alice, 'Inmobiliaria Suscripta');
    const provider = fakeProvider();
    const first = await subscription(orgId, 'inicial', 'pre_1');
    await applySubscriptionStatus(db.admin, { provider: 'mercadopago', providerSubscriptionId: 'pre_1', status: 'authorized' }, { provider, now });
    expect(await org(orgId)).toMatchObject({ subscriptionStatus: 'active', planId: first.plan.id });

    const second = await subscription(orgId, 'profesional', 'pre_2');
    await applySubscriptionStatus(db.admin, { provider: 'mercadopago', providerSubscriptionId: 'pre_2', status: 'authorized' }, { provider, now });
    expect(await org(orgId)).toMatchObject({ subscriptionStatus: 'active', planId: second.plan.id });
    expect(provider.cancelled).toEqual(['pre_1']);

    // The old one's cancellation arrives later: it no longer matters.
    await applySubscriptionStatus(db.admin, { provider: 'mercadopago', providerSubscriptionId: 'pre_1', status: 'cancelled' }, { provider, now });
    expect((await org(orgId)).subscriptionStatus).toBe('active');

    // Payment problems, then cancellation of the current one: read-only (trial already used).
    await db.admin.update(organizations).set({ trialEndsAt: new Date(now.getTime() - 1000) }).where(eq(organizations.id, orgId));
    await applySubscriptionStatus(db.admin, { provider: 'mercadopago', providerSubscriptionId: 'pre_2', status: 'paused' }, { provider, now });
    expect((await org(orgId)).subscriptionStatus).toBe('past_due');
    await applySubscriptionStatus(db.admin, { provider: 'mercadopago', providerSubscriptionId: 'pre_2', status: 'cancelled' }, { provider, now });
    expect((await org(orgId)).subscriptionStatus).toBe('cancelled');
  });

  it('ignores unknown subscriptions and records payments once', async () => {
    const orgId = await createOrganization(alice, 'Inmobiliaria Pagos');
    expect(await applySubscriptionStatus(db.admin, { provider: 'mercadopago', providerSubscriptionId: 'nope', status: 'authorized' }, { provider: fakeProvider(), now })).toBeNull();
    const { row } = await subscription(orgId, 'inicial', 'pre_3');
    const payment = { id: '77', subscriptionId: 'pre_3', status: 'approved', amount: '35000.00', currency: 'ARS', date: now };
    await recordSubscriptionPayment(db.admin, 'mercadopago', payment);
    await recordSubscriptionPayment(db.admin, 'mercadopago', { ...payment, status: 'refunded' });
    expect(await db.admin.select().from(subscriptionPayments).where(eq(subscriptionPayments.subscriptionId, row.id))).toEqual([
      expect.objectContaining({ providerPaymentId: '77', status: 'refunded', amount: '35000.00' }),
    ]);
  });
});

describe('MercadoPago', () => {
  it('creates a monthly or yearly debit with our reference', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'pre_9', init_point: 'https://mp/checkout' }), { status: 201 }));
    const created = await mercadoPagoProvider('TEST-token', fetchMock).create({
      reference: 'sub-1',
      reason: 'Rentavle · Inicial',
      payerEmail: 'admin@inmo.test',
      amount: '350000.00',
      currency: 'ARS',
      frequencyMonths: 12,
      backUrl: 'https://rentavle.com/suscripcion',
    });
    expect(created).toEqual({ id: 'pre_9', checkoutUrl: 'https://mp/checkout' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.mercadopago.com/preapproval');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TEST-token');
    expect(JSON.parse(init.body as string)).toMatchObject({
      external_reference: 'sub-1',
      auto_recurring: { frequency: 12, frequency_type: 'months', transaction_amount: 350000, currency_id: 'ARS' },
    });
  });

  it('verifies webhook signatures', () => {
    const ts = String(now.getTime());
    const v1 = createHmac('sha256', 'secreto').update(`id:2c9380847e9b451c017ea1bd70ba0219;request-id:req-1;ts:${ts};`).digest('hex');
    const input = { signature: `ts=${ts},v1=${v1}`, requestId: 'req-1', dataId: '2C9380847E9B451C017EA1BD70BA0219' };
    expect(verifyMercadoPagoSignature('secreto', input, now)).toBe(true);
    expect(verifyMercadoPagoSignature('otro', input, now)).toBe(false);
    expect(verifyMercadoPagoSignature('secreto', { ...input, dataId: '2c9380847e9b451c017ea1bd70ba0220' }, now)).toBe(false);
    expect(verifyMercadoPagoSignature('secreto', input, new Date(now.getTime() + 600_000))).toBe(false);
    expect(verifyMercadoPagoSignature('secreto', { ...input, signature: null }, now)).toBe(false);
  });
});
