import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '@rentavle/db';
import { createTestDb, type TestUser } from '../../db/test/helpers';
import { generateCharges } from '../src/generate-charges';

const { contracts, rentPeriods, charges, recurringCharges, properties } = schema;
const { db, createUser, createOrganization, cleanup } = createTestDb();

let alice: TestUser;
let orgId: string;

/**
 * Semiannual contract Apr-2026 → Mar-2029 loaded in progress from Aug-2026:
 * period 1 (Apr–Sep) = 500.000, period 2 (Oct–Mar) still waiting for its index.
 */
async function contractInProgress() {
  const [property] = await db.admin
    .insert(properties)
    .values({ organizationId: orgId, street: `Calle ${randomUUID().slice(0, 4)}` })
    .returning();
  const [contract] = await db.admin
    .insert(contracts)
    .values({
      organizationId: orgId,
      propertyId: property!.id,
      startDate: '2026-04-01',
      endDate: '2029-03-31',
      originalEndDate: '2029-03-31',
      currency: 'ARS',
      initialAmount: '500000',
      firstBilledMonth: '2026-08-01',
      updateMode: 'fixed_pct',
      fixedUpdatePct: '10',
      updateFrequencyMonths: 6,
      dueDay: 10,
    })
    .returning();
  await db.admin.insert(rentPeriods).values([
    { organizationId: orgId, contractId: contract!.id, periodNumber: 1, startMonth: '2026-04-01', endMonth: '2026-09-01', status: 'initial', amount: '500000' },
    { organizationId: orgId, contractId: contract!.id, periodNumber: 2, startMonth: '2026-10-01', endMonth: '2027-03-01', status: 'pending_index' },
  ]);
  return contract!;
}

function chargesOf(contractId: string) {
  return db.admin.select().from(charges).where(eq(charges.contractId, contractId)).orderBy(asc(charges.periodMonth), asc(charges.type));
}

beforeAll(async () => {
  alice = await createUser('alice');
  orgId = await createOrganization(alice, 'Inmobiliaria Deudas');
});

afterAll(async () => {
  await db.admin.delete(contracts).where(eq(contracts.organizationId, orgId));
  await cleanup();
});

describe('generateCharges', () => {
  it('catches up rent from the first billed month, with unconfirmed amounts while the index is pending', async () => {
    const contract = await contractInProgress();
    const result = await generateCharges(db.admin, { now: new Date('2026-10-14T12:00:00Z'), contractId: contract.id });
    expect(result.rentCreated).toBe(3);

    const rows = await chargesOf(contract.id);
    expect(rows.map((c) => [c.periodMonth, c.amount, c.isConfirmed, c.installmentNumber, c.dueDate])).toEqual([
      ['2026-08-01', '500000.00', true, 5, '2026-08-10'],
      ['2026-09-01', '500000.00', true, 6, '2026-09-10'],
      ['2026-10-01', '500000.00', false, 7, '2026-10-10'],
    ]);
    expect(rows.every((c) => c.debtor === 'tenant' && c.creditor === 'owner' && c.appliesFee)).toBe(true);
  });

  it('is idempotent', async () => {
    const [contract] = await db.admin.select().from(contracts).where(eq(contracts.organizationId, orgId));
    const again = await generateCharges(db.admin, { now: new Date('2026-10-14T12:00:00Z'), contractId: contract!.id });
    expect(again.rentCreated).toBe(0);
    expect(await chargesOf(contract!.id)).toHaveLength(3);
  });

  it('confirms the pending rent once the update is calculated', async () => {
    const [contract] = await db.admin.select().from(contracts).where(eq(contracts.organizationId, orgId));
    await db.admin
      .update(rentPeriods)
      .set({ status: 'calculated', amount: '550000', previousAmount: '500000' })
      .where(and(eq(rentPeriods.contractId, contract!.id), eq(rentPeriods.periodNumber, 2)));
    const result = await generateCharges(db.admin, { now: new Date('2026-10-20T12:00:00Z'), contractId: contract!.id });
    expect(result.rentConfirmed).toBe(1);
    const october = (await chargesOf(contract!.id)).find((c) => c.periodMonth === '2026-10-01');
    expect(october).toMatchObject({ amount: '550000.00', isConfirmed: true, calcExplanation: null });
  });

  it('creates next month in advance when asked', async () => {
    const [contract] = await db.admin.select().from(contracts).where(eq(contracts.organizationId, orgId));
    await generateCharges(db.admin, { now: new Date('2026-10-20T12:00:00Z'), contractId: contract!.id, includeNextMonth: true });
    const november = (await chargesOf(contract!.id)).find((c) => c.periodMonth === '2026-11-01');
    expect(november).toMatchObject({ amount: '550000.00', installmentNumber: 8 });
  });

  it('generates recurring charges in advance and in arrears, unconfirmed when variable', async () => {
    const contract = await contractInProgress();
    await db.admin.insert(recurringCharges).values([
      { organizationId: orgId, contractId: contract.id, title: 'Expensas', currency: 'ARS', startMonth: '2026-09-01', lastAmount: '80000', requiresConfirmation: true },
      { organizationId: orgId, contractId: contract.id, title: 'Luz', currency: 'ARS', startMonth: '2026-08-01', lastAmount: '15000', timing: 'in_arrears' },
      { organizationId: orgId, contractId: contract.id, title: 'ABL', currency: 'ARS', startMonth: '2026-08-01', lastAmount: '20000', frequencyMonths: 2, debtor: 'owner', creditor: 'administration' },
    ]);
    await generateCharges(db.admin, { now: new Date('2026-10-14T12:00:00Z'), contractId: contract.id });

    const recurring = (await chargesOf(contract.id)).filter((c) => c.type === 'recurring');
    const summary = recurring.map((c) => `${c.title} ${c.periodMonth.slice(0, 7)} (${c.serviceMonth?.slice(0, 7)}) ${c.isConfirmed ? 'ok' : 'estimado'}`);
    expect(summary.sort()).toEqual(
      [
        'ABL 2026-08 (2026-08) ok',
        'ABL 2026-10 (2026-10) ok',
        'Expensas 2026-09 (2026-09) estimado',
        'Expensas 2026-10 (2026-10) estimado',
        'Luz 2026-09 (2026-08) ok',
        'Luz 2026-10 (2026-09) ok',
      ].sort(),
    );
    const abl = recurring.find((c) => c.title === 'ABL');
    expect(abl).toMatchObject({ debtor: 'owner', creditor: 'administration' });
  });

  it('does not re-create voided debts, and skips finished contracts', async () => {
    const contract = await contractInProgress();
    await generateCharges(db.admin, { now: new Date('2026-08-14T12:00:00Z'), contractId: contract.id });
    const [august] = await chargesOf(contract.id);
    await db.admin.update(charges).set({ status: 'void', voidedAt: new Date(), voidReason: 'error de carga' }).where(eq(charges.id, august!.id));

    // A voided month stays voided: the job never re-creates it.
    await generateCharges(db.admin, { now: new Date('2026-08-14T12:00:00Z'), contractId: contract.id });
    expect((await chargesOf(contract.id)).map((c) => c.status)).toEqual(['void']);

    await db.admin.update(contracts).set({ status: 'finished' }).where(eq(contracts.id, contract.id));
    const result = await generateCharges(db.admin, { now: new Date('2026-12-14T12:00:00Z'), contractId: contract.id });
    expect(result.contracts).toBe(0);
  });
});
