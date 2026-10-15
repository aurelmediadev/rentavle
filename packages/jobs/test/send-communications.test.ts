import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '@rentavle/db';
import type { EmailMessage, Mailer } from '@rentavle/emails';
import { createTestDb, type TestUser } from '../../db/test/helpers';
import { sendCommunications } from '../src/send-communications';

const { organizations, contracts, contractParties, clients, clientContacts, properties, charges, rentPeriods, communications } = schema;
const { db, createUser, createOrganization, purgeLedger, cleanup } = createTestDb();

let alice: TestUser;
const orgs: string[] = [];

function fakeMailer(failTimes = 0): Mailer & { sent: EmailMessage[] } {
  let failures = failTimes;
  const sent: EmailMessage[] = [];
  return {
    provider: 'mailpit',
    sent,
    async send(m) {
      if (failures > 0) {
        failures--;
        throw new Error('servidor caído');
      }
      sent.push(m);
      return { id: `msg-${sent.length}` };
    },
  };
}

/** Agency with notices on, a contract ending 2027-03-31 and a tenant (and owner) with or without email. */
async function agency(opts: { tenantEmail?: string | null; agencyEmail?: string } = {}) {
  const orgId = await createOrganization(alice, `Inmobiliaria Avisos ${orgs.length + 1}`);
  orgs.push(orgId);
  await db.admin
    .update(organizations)
    .set({
      email: opts.agencyEmail ?? null,
      // Subscribed: the tests simulate dates after a trial would have ended.
      subscriptionStatus: 'active',
      settings: { notices: { paymentReminder: true, lateNotice: true, amountUpdate: true, contractExpiry: true } },
    })
    .where(eq(organizations.id, orgId));
  const [property] = await db.admin.insert(properties).values({ organizationId: orgId, street: 'Juan B. Justo', streetNumber: '1234' }).returning();
  const [tenant] = await db.admin.insert(clients).values({ organizationId: orgId, kind: 'person', firstName: 'Ana', lastName: 'Inquilina' }).returning();
  const [owner] = await db.admin.insert(clients).values({ organizationId: orgId, kind: 'person', firstName: 'Pedro', lastName: 'Dueño' }).returning();
  if (opts.tenantEmail !== null) {
    await db.admin.insert(clientContacts).values({ organizationId: orgId, clientId: tenant!.id, type: 'email', value: opts.tenantEmail ?? 'ana@example.com', isPrimary: true });
  }
  await db.admin.insert(clientContacts).values({ organizationId: orgId, clientId: owner!.id, type: 'email', value: 'pedro@example.com' });
  const [contract] = await db.admin
    .insert(contracts)
    .values({ organizationId: orgId, propertyId: property!.id, startDate: '2025-04-01', endDate: '2027-03-31', originalEndDate: '2027-03-31', currency: 'ARS', initialAmount: '500000', firstBilledMonth: '2026-10-01' })
    .returning();
  await db.admin.insert(contractParties).values([
    { organizationId: orgId, contractId: contract!.id, clientId: tenant!.id, role: 'tenant' },
    { organizationId: orgId, contractId: contract!.id, clientId: owner!.id, role: 'owner', sharePct: '100' },
  ]);
  return { orgId, contractId: contract!.id };
}

function debt(a: { orgId: string; contractId: string }, over: Partial<typeof charges.$inferInsert> = {}) {
  return db.admin
    .insert(charges)
    .values({ organizationId: a.orgId, contractId: a.contractId, type: 'rent', periodMonth: '2026-10-01', title: 'Alquiler', amount: '500000', currency: 'ARS', debtor: 'tenant', creditor: 'owner', dueDate: '2026-10-10', ...over })
    .returning();
}

const run = (orgId: string, date: string, mailer: Mailer) => sendCommunications(db.admin, { now: new Date(`${date}T12:00:00Z`), mailer, organizationId: orgId });
const history = (orgId: string) => db.admin.select().from(communications).where(eq(communications.organizationId, orgId));

beforeAll(async () => {
  alice = await createUser('alice');
});

afterAll(async () => {
  for (const orgId of orgs) {
    await purgeLedger(orgId);
    await db.admin.delete(contracts).where(eq(contracts.organizationId, orgId));
  }
  await cleanup();
});

describe('automatic notices', () => {
  it('sends nothing while notices are off', async () => {
    const a = await agency();
    await debt(a);
    await db.admin.update(organizations).set({ settings: {} }).where(eq(organizations.id, a.orgId));
    const mailer = fakeMailer();
    expect(await run(a.orgId, '2026-10-08', mailer)).toMatchObject({ organizations: 0, sent: 0 });
  });

  it('sends nothing for read-only accounts', async () => {
    const a = await agency();
    await debt(a);
    await db.admin.update(organizations).set({ subscriptionStatus: 'cancelled' }).where(eq(organizations.id, a.orgId));
    expect(await run(a.orgId, '2026-10-08', fakeMailer())).toMatchObject({ organizations: 0, sent: 0 });
  });

  it('reminds once before the due date, listing everything due that day', async () => {
    const a = await agency();
    await debt(a);
    await debt(a, { type: 'one_off', title: 'Expensas', amount: '80000', creditor: 'administration' });
    const mailer = fakeMailer();
    expect(await run(a.orgId, '2026-10-07', mailer)).toMatchObject({ sent: 1 });
    expect(mailer.sent[0]).toMatchObject({ to: [{ email: 'ana@example.com', name: 'Ana Inquilina' }], subject: 'Recordatorio de pago: vence el 10 de octubre de 2026' });
    expect(mailer.sent[0]!.text).toContain('el pago de alquiler de octubre de 2026 y Expensas de octubre de 2026');
    expect(mailer.sent[0]!.text).toMatch(/El saldo a pagar es \$\s580\.000/);

    // Next day: already sent.
    expect(await run(a.orgId, '2026-10-08', mailer)).toMatchObject({ sent: 0, skipped: 1 });
    expect(mailer.sent).toHaveLength(1);
  });

  it('sends late notices on each threshold and stops when paid', async () => {
    const a = await agency();
    const [rent] = await debt(a);
    const mailer = fakeMailer();
    await run(a.orgId, '2026-10-11', mailer);
    await run(a.orgId, '2026-10-15', mailer);
    expect(mailer.sent.map((m) => m.subject)).toEqual(['Aviso de deuda vencida el 10 de octubre de 2026', 'Aviso de deuda vencida el 10 de octubre de 2026']);
    expect(mailer.sent[1]!.text).toContain('lleva 5 días de atraso');

    await db.admin.update(charges).set({ status: 'paid' }).where(eq(charges.id, rent!.id));
    await run(a.orgId, '2026-10-20', mailer);
    expect(mailer.sent).toHaveLength(2);
  });

  it('records tenants without email as failed, without retrying them', async () => {
    const a = await agency({ tenantEmail: null });
    await debt(a);
    const mailer = fakeMailer();
    expect(await run(a.orgId, '2026-10-08', mailer)).toMatchObject({ failed: 1, sent: 0 });
    expect(await run(a.orgId, '2026-10-09', mailer)).toMatchObject({ retried: 0, skipped: 1 });
    expect(await history(a.orgId)).toEqual([expect.objectContaining({ status: 'failed', error: 'Sin email cargado', toAddress: '' })]);
  });

  it('retries a failed send on the next run', async () => {
    const a = await agency();
    await debt(a);
    const mailer = fakeMailer(1);
    expect(await run(a.orgId, '2026-10-08', mailer)).toMatchObject({ failed: 1 });
    expect(await run(a.orgId, '2026-10-08', mailer)).toMatchObject({ retried: 1, sent: 1 });
    expect(await history(a.orgId)).toEqual([expect.objectContaining({ status: 'sent', attempts: 2, providerMessageId: 'msg-1', error: null })]);
  });

  it('announces a confirmed new amount to tenant and owners', async () => {
    const a = await agency();
    await db.admin.insert(rentPeriods).values({
      organizationId: a.orgId,
      contractId: a.contractId,
      periodNumber: 2,
      startMonth: '2026-11-01',
      endMonth: '2027-01-01',
      status: 'calculated',
      previousAmount: '500000',
      amount: '573037.99',
      variationPct: '14.6076',
    });
    const mailer = fakeMailer();
    expect(await run(a.orgId, '2026-10-22', mailer)).toMatchObject({ sent: 2 });
    expect(mailer.sent.map((m) => m.to[0]!.email).sort()).toEqual(['ana@example.com', 'pedro@example.com']);
    expect(mailer.sent[0]!.text.replace(/\s/g, ' ')).toContain('desde noviembre de 2026 el alquiler pasa de $ 500.000 a $ 573.037,99 (+14,61 %)');
  });

  it('warns the agency before a contract ends', async () => {
    const a = await agency({ agencyEmail: 'admin@inmobiliaria.test' });
    const mailer = fakeMailer();
    await run(a.orgId, '2027-01-30', mailer);
    expect(mailer.sent).toEqual([expect.objectContaining({ to: [{ email: 'admin@inmobiliaria.test', name: expect.any(String) }] })]);
    expect(mailer.sent[0]!.subject).toMatch(/El contrato #\d+ vence en 60 días/);
    const [row] = await db.admin.select().from(communications).where(and(eq(communications.organizationId, a.orgId), eq(communications.type, 'contract_expiry')));
    expect(row).toMatchObject({ clientId: null, sender: 'automatic', status: 'sent' });
  });
});
