/** Debts: isolation, no deletes, and protection once something was paid. */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { charges, contracts, properties, recurringCharges } from '../src/schema';
import { createTestDb, expectDbError, type TestUser } from './helpers';

const { db, createUser, createOrganization, purgeLedger, cleanup } = createTestDb();

let alice: TestUser;
let bob: TestUser;
let orgA: string;
let orgB: string;
let contractA: string;

const baseCharge = () => ({
  organizationId: orgA,
  contractId: contractA,
  type: 'one_off' as const,
  periodMonth: '2026-10-01',
  title: 'Reparación',
  amount: '15000',
  currency: 'ARS',
  debtor: 'tenant' as const,
  creditor: 'owner' as const,
  dueDate: '2026-10-10',
});

beforeAll(async () => {
  alice = await createUser('alice');
  bob = await createUser('bob');
  orgA = await createOrganization(alice, 'Inmobiliaria A');
  orgB = await createOrganization(bob, 'Inmobiliaria B');
  const [property] = await db.admin.insert(properties).values({ organizationId: orgA, street: 'Ficticia' }).returning();
  const [contract] = await db.admin
    .insert(contracts)
    .values({
      organizationId: orgA,
      propertyId: property!.id,
      startDate: '2026-01-01',
      endDate: '2027-12-31',
      originalEndDate: '2027-12-31',
      currency: 'ARS',
      initialAmount: '100000',
      firstBilledMonth: '2026-01-01',
    })
    .returning();
  contractA = contract!.id;
});

afterAll(async () => {
  await purgeLedger(orgA);
  await db.admin.delete(contracts).where(eq(contracts.organizationId, orgA));
  await cleanup();
});

describe('charges', () => {
  it('lets members create debts and discounts on their contracts', async () => {
    const created = await db.withUser(alice.claims, (tx) =>
      tx.insert(charges).values([baseCharge(), { ...baseCharge(), title: 'Bonificación', amount: '-5000' }]).returning(),
    );
    expect(created).toHaveLength(2);
  });

  it('rejects zero amounts and two active rent debts in the same month', async () => {
    await expectDbError(
      db.withUser(alice.claims, (tx) => tx.insert(charges).values({ ...baseCharge(), amount: '0' })),
      /charges_amount_nonzero/,
    );
    const rent = { ...baseCharge(), type: 'rent' as const, title: 'Alquiler', periodMonth: '2026-11-01' };
    await db.withUser(alice.claims, (tx) => tx.insert(charges).values(rent));
    await expectDbError(db.withUser(alice.claims, (tx) => tx.insert(charges).values(rent)), /charges_rent_once_per_month/);
  });

  it('isolates debts between organizations', async () => {
    const seen = await db.withUser(bob.claims, (tx) => tx.select().from(charges));
    expect(seen).toEqual([]);
    await expectDbError(
      db.withUser(bob.claims, (tx) => tx.insert(charges).values({ ...baseCharge(), organizationId: orgB })),
      /row-level security/,
    );
  });

  it('never deletes debts', async () => {
    const deleted = await db.withUser(alice.claims, (tx) => tx.delete(charges).where(eq(charges.contractId, contractA)).returning());
    expect(deleted).toEqual([]);
  });

  it('protects debts with payments and voided debts', async () => {
    const [charge] = await db.withUser(alice.claims, (tx) =>
      tx.insert(charges).values({ ...baseCharge(), title: 'Pintura' }).returning(),
    );
    // Payments arrive in a later phase; simulate one.
    await db.admin.update(charges).set({ status: 'partially_paid' }).where(eq(charges.id, charge!.id));

    await expectDbError(
      db.withUser(alice.claims, (tx) => tx.update(charges).set({ amount: '1' }).where(eq(charges.id, charge!.id))),
      /ya tiene pagos/,
    );
    await expectDbError(
      db.withUser(alice.claims, (tx) =>
        tx.update(charges).set({ status: 'void', voidedAt: new Date() }).where(eq(charges.id, charge!.id)),
      ),
      /ya tiene pagos/,
    );

    const [other] = await db.withUser(alice.claims, (tx) => tx.insert(charges).values({ ...baseCharge(), title: 'Error' }).returning());
    await db.withUser(alice.claims, (tx) =>
      tx.update(charges).set({ status: 'void', voidedAt: new Date(), voidReason: 'cargado dos veces' }).where(eq(charges.id, other!.id)),
    );
    await expectDbError(
      db.withUser(alice.claims, (tx) => tx.update(charges).set({ amount: '9' }).where(eq(charges.id, other!.id))),
      /está anulada/,
    );
    // Restoring (same amount and parties) is the only change allowed on a voided debt.
    const [restored] = await db.withUser(alice.claims, (tx) =>
      tx.update(charges).set({ status: 'pending', voidedAt: null, voidReason: null }).where(eq(charges.id, other!.id)).returning(),
    );
    expect(restored?.status).toBe('pending');
  });

  it('only accepts recurring templates of the same contract', async () => {
    const [property] = await db.admin.insert(properties).values({ organizationId: orgA, street: 'Otra' }).returning();
    const [other] = await db.admin
      .insert(contracts)
      .values({ organizationId: orgA, propertyId: property!.id, startDate: '2026-01-01', endDate: '2026-12-31', originalEndDate: '2026-12-31', currency: 'ARS', initialAmount: '1', firstBilledMonth: '2026-01-01' })
      .returning();
    const [template] = await db.withUser(alice.claims, (tx) =>
      tx.insert(recurringCharges).values({ organizationId: orgA, contractId: other!.id, title: 'Expensas', currency: 'ARS', startMonth: '2026-01-01', lastAmount: '1' }).returning(),
    );
    await expectDbError(
      db.withUser(alice.claims, (tx) => tx.insert(charges).values({ ...baseCharge(), type: 'recurring', recurringChargeId: template!.id })),
      /row-level security/,
    );
  });
});
